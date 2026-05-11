import base64
import logging
import os
import tempfile

logger = logging.getLogger(__name__)

from apps.scanner.engines.browser_launcher import launch_chromium
from apps.scanner.patches.responsive_patches import (
    EXTRACT_RENDERED_PAGE_JS,
    build_css_patch,
    detect_rendered_issues,
)

# Google Drive folder ID where screenshots will be uploaded.
# Set GDRIVE_SCREENSHOTS_FOLDER_ID in your .env; leave empty to upload to Drive root.
_GDRIVE_FOLDER_ID = os.environ.get("GDRIVE_SCREENSHOTS_FOLDER_ID", "")

# Set to True only when Drive credentials are properly configured.
_DRIVE_ENABLED = bool(os.environ.get("GOOGLE_SERVICE_ACCOUNT_JSON"))

VIEWPORTS = [
    {"name": "mobile", "width": 384,  "height": 854,  "device_key": "galaxy-s24-ultra", "label": "Samsung S24 Ultra"},
    {"name": "tablet", "width": 800,  "height": 1280, "device_key": "galaxy-tab-s9-fe", "label": "Samsung S9 FE"},
    {"name": "laptop", "width": 1440, "height": 900,  "device_key": "galaxy-book-5", "label": "Galaxy Book 5"},
]

PAGE_TIMEOUT    = 30_000
WAIT_AFTER_LOAD = 2_000

DEVICE_DESCRIPTOR_ALIASES = {
    "iphone-se": "iPhone SE",
    "iphone-12-pro": "iPhone 12 Pro",
    "iphone-15": "iPhone 14",
    "iphone-plus": "iPhone 8 Plus",
    "iphone-15-pro-max": "iPhone 14 Pro Max",
    "pixel-7": "Pixel 7",
    "pixel-9": "Pixel 7",
    "galaxy-s22": "Galaxy S8",
    "oneplus-11": "Pixel 7",
    "ipad-mini": "iPad Mini",
    "ipad": "iPad",
    "ipad-air": "iPad (gen 7)",
    "ipad-pro-11": "iPad Pro 11",
    "ipad-pro-13": "iPad Pro 11",
    "surface-duo": "Galaxy Tab S4",
}

MOBILE_CHROME_USER_AGENT = (
    "Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36"
)

DESKTOP_CHROME_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)


def _device_context_options(playwright, *, device_key="", label="", width=390, height=844):
    key = (device_key or "").strip().lower()
    descriptor_name = DEVICE_DESCRIPTOR_ALIASES.get(key)
    if not descriptor_name and label:
        normalized_label = label.strip().lower()
        for candidate in playwright.devices:
            if candidate.lower() == normalized_label:
                descriptor_name = candidate
                break

    if descriptor_name and descriptor_name in playwright.devices:
        options = dict(playwright.devices[descriptor_name])
        options["viewport"] = {"width": int(width), "height": int(height)}
        options["screen"] = {"width": int(width), "height": int(height)}
        return options

    is_mobile = int(width) <= 540
    is_tablet = 541 <= int(width) <= 1024 and int(height) >= 700
    return {
        "viewport": {"width": int(width), "height": int(height)},
        "screen": {"width": int(width), "height": int(height)},
        "is_mobile": is_mobile or is_tablet,
        "has_touch": is_mobile or is_tablet,
        "device_scale_factor": 3 if is_mobile else 2 if is_tablet else 1,
        "user_agent": MOBILE_CHROME_USER_AGENT if is_mobile or is_tablet else DESKTOP_CHROME_USER_AGENT,
    }


def render_device_screenshot(url: str, *, device_key="", label="", width=390, height=844, full_page=True) -> bytes:
    from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

    with sync_playwright() as pw:
        browser = launch_chromium(pw, headless=True)
        context = browser.new_context(**_device_context_options(
            pw,
            device_key=device_key,
            label=label,
            width=width,
            height=height,
        ))
        page = context.new_page()
        try:
            try:
                page.goto(url, wait_until="networkidle", timeout=PAGE_TIMEOUT)
            except PWTimeout:
                page.goto(url, wait_until="load", timeout=PAGE_TIMEOUT)
            page.wait_for_timeout(WAIT_AFTER_LOAD)
            return page.screenshot(full_page=full_page, type="png")
        finally:
            context.close()
            browser.close()

_JS_OVERFLOW = """
() => {
    const vw = document.documentElement.clientWidth;
    const seen = {};
    document.querySelectorAll('*').forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.width > vw + 2) {
            const tag = el.tagName.toLowerCase();
            const id  = el.id ? '#' + el.id : '';
            const cls = (typeof el.className === 'string' && el.className.trim())
                        ? '.' + el.className.trim().split(/\\s+/).slice(0,2).join('.')
                        : '';
            const key = tag + id + cls;
            const over = Math.round(r.width - vw);
            if (!seen[key] || seen[key].overflow < over) {
                seen[key] = { selector: key, elementWidth: Math.round(r.width),
                               viewportWidth: vw, overflow: over };
            }
        }
    });
    return Object.values(seen).slice(0, 10);
}
"""

_JS_IMAGE_OVERFLOW = """
() => {
    const issues = [];
    document.querySelectorAll('img').forEach(img => {
        const parent = img.parentElement;
        if (!parent) return;
        const ir = img.getBoundingClientRect();
        const pr = parent.getBoundingClientRect();
        if (ir.width > pr.width + 2) {
            issues.push({ src: img.src.slice(0, 100), imgWidth: Math.round(ir.width),
                          containerWidth: Math.round(pr.width), overflow: Math.round(ir.width - pr.width) });
        }
    });
    return issues.slice(0, 10);
}
"""

_JS_TOUCH_TARGETS = """
() => {
    const MIN = 44;
    const issues = [];
    document.querySelectorAll('a, button, input, select, textarea, [role="button"], [tabindex]').forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0 && (r.width < MIN || r.height < MIN)) {
            issues.push({ tag: el.tagName.toLowerCase(),
                          label: (el.textContent.trim().slice(0, 30) || el.getAttribute('aria-label') || ''),
                          width: Math.round(r.width), height: Math.round(r.height) });
        }
    });
    return issues.slice(0, 10);
}
"""

_JS_INVISIBLE_BLOCKS = """
() => {
    const issues = [];
    ['section','article','main','aside','header','footer','nav','div'].forEach(t => {
        document.querySelectorAll(t).forEach(el => {
            const r = el.getBoundingClientRect();
            const style = window.getComputedStyle(el);
            if (r.width > 100 && r.height === 0 && style.display !== 'none') {
                const id  = el.id ? '#' + el.id : '';
                const cls = (typeof el.className === 'string' && el.className.trim())
                            ? '.' + el.className.trim().split(/\\s+/)[0] : '';
                issues.push({ selector: t + id + cls, width: Math.round(r.width) });
            }
        });
    });
    return issues.slice(0, 5);
}
"""

_JS_OVERLAPPING = """
() => {
    const positioned = Array.from(document.querySelectorAll('*')).filter(el => {
        const s = window.getComputedStyle(el);
        return (s.position === 'absolute' || s.position === 'fixed') && s.display !== 'none';
    });
    const issues = [];
    for (let i = 0; i < Math.min(positioned.length, 60); i++) {
        const a = positioned[i].getBoundingClientRect();
        for (let j = i + 1; j < Math.min(positioned.length, 60); j++) {
            const b = positioned[j].getBoundingClientRect();
            if (!(a.right < b.left || b.right < a.left || a.bottom < b.top || b.bottom < a.top)
                && a.width > 20 && b.width > 20) {
                issues.push({ elements: `${positioned[i].tagName.toLowerCase()} ↔ ${positioned[j].tagName.toLowerCase()}` });
                if (issues.length >= 5) return issues;
            }
        }
    }
    return issues;
}
"""


def _resolution_suggestions(device_results: list) -> list:
    suggestions = []
    broken = [r["device"] for r in device_results if r["issues"]]
    if "mobile" in broken:
        suggestions.append({"category": "viewport", "title": "Optimise for 375px (iPhone SE / standard mobile)",
            "detail": "Layout issues detected at 375px. Add or tighten: @media (max-width: 480px) { … }"})
    if "tablet" in broken:
        suggestions.append({"category": "layout", "title": "Optimise for 768px (iPad / tablet)",
            "detail": "Issues found at 768px. Add: @media (min-width: 481px) and (max-width: 1024px) { … }"})
    if "laptop" in broken:
        suggestions.append({"category": "layout", "title": "Optimise for 1280px (laptop)",
            "detail": "Issues found at 1280px. Ensure main container uses max-width: 1200px with auto margins."})
    if not broken:
        suggestions.append({"category": "performance", "title": "All viewports look clean",
            "detail": "No overflow or layout issues detected. Consider adding 320px and 2560px checks."})
    suggestions.append({"category": "images", "title": "Serve next-gen image formats",
        "detail": "Use WebP/AVIF with <picture> + srcset to reduce payload on mobile networks."})
    suggestions.append({"category": "performance", "title": "Test on real devices",
        "detail": "Automated viewport emulation doesn't replicate real device rendering. Verify on physical iOS and Android."})
    return suggestions


def _build_issues(device: str, overflow, img_overflow, touch, invisible, overlapping) -> list:
    issues = []
    if overflow:
        worst = max(overflow, key=lambda x: x["overflow"])
        issues.append({"severity": "critical", "title": f"Horizontal overflow at {device} ({worst['overflow']}px beyond viewport)",
            "description": f"{len(overflow)} element(s) exceed the {worst['viewportWidth']}px viewport. Worst: `{worst['selector']}` ({worst['elementWidth']}px).",
            "device": device.capitalize(), "source": "playwright"})
    if img_overflow:
        issues.append({"severity": "warning", "title": f"{len(img_overflow)} image(s) overflow their container at {device}",
            "description": "Images are wider than their parent containers. Add `img { max-width: 100%; height: auto; }`.",
            "device": device.capitalize(), "source": "playwright"})
    return issues
    if touch:
        issues.append({"severity": "warning", "title": f"{len(touch)} small touch target(s) at {device}",
            "description": f"Interactive elements smaller than 44×44px. Example: <{touch[0]['tag']}> is {touch[0]['width']}×{touch[0]['height']}px.",
            "device": device.capitalize(), "source": "playwright"})
    if invisible:
        issues.append({"severity": "info", "title": f"{len(invisible)} zero-height block(s) at {device}",
            "description": "Visible-width containers with zero height — likely collapsed flex/grid parents. Check: " + ", ".join(i["selector"] for i in invisible[:3]),
            "device": device.capitalize(), "source": "playwright"})
    if overlapping:
        issues.append({"severity": "warning", "title": f"Overlapping positioned elements at {device}",
            "description": f"{len(overlapping)} pair(s) of absolutely/fixed-positioned elements overlap.",
            "device": device.capitalize(), "source": "playwright"})
    return issues


def run_playwright_scan(url: str) -> dict:
    from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

    screenshots: dict = {}
    device_results: list = []
    all_issues: list = []

    with sync_playwright() as pw:
        browser = launch_chromium(pw, headless=True)
        for vp in VIEWPORTS:
            device = vp["name"]
            logger.info("Playwright scanning %s @ %dpx", device, vp["width"])
            context = browser.new_context(**_device_context_options(
                pw,
                device_key=vp.get("device_key", device),
                label=vp.get("label", device),
                width=vp["width"],
                height=vp["height"],
            ))
            page = context.new_page()
            try:
                page.goto(url, wait_until="networkidle", timeout=PAGE_TIMEOUT)
                page.wait_for_timeout(WAIT_AFTER_LOAD)

                # Capture screenshot — upload to Drive if configured, else store as base64
                with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
                    tmp_path = tmp.name
                try:
                    page.screenshot(path=tmp_path, full_page=True, type="png")
                    if _DRIVE_ENABLED:
                        try:
                            from apps.storage.gdrive import upload_screenshot
                            drive_url = upload_screenshot(
                                file_path=tmp_path,
                                device_name=device,
                                folder_id=_GDRIVE_FOLDER_ID or None,
                            )
                            screenshots[device] = drive_url
                            logger.info("Screenshot for %s uploaded to Drive: %s", device, drive_url)
                        except Exception as drive_exc:
                            logger.warning("Drive upload failed for %s, falling back to base64: %s", device, drive_exc)
                            with open(tmp_path, "rb") as f:
                                screenshots[device] = "data:image/png;base64," + base64.b64encode(f.read()).decode()
                    else:
                        with open(tmp_path, "rb") as f:
                            screenshots[device] = "data:image/png;base64," + base64.b64encode(f.read()).decode()
                except Exception as upload_exc:
                    logger.error("Screenshot capture failed for %s: %s", device, upload_exc)
                    screenshots[device] = None
                finally:
                    try:
                        os.unlink(tmp_path)
                    except OSError:
                        pass
                overflow     = page.evaluate(_JS_OVERFLOW)       or []
                img_overflow = page.evaluate(_JS_IMAGE_OVERFLOW) or []
                touch        = page.evaluate(_JS_TOUCH_TARGETS)  or []
                invisible    = page.evaluate(_JS_INVISIBLE_BLOCKS) or []
                overlapping  = page.evaluate(_JS_OVERLAPPING)    or []
                issues = _build_issues(device, overflow, img_overflow, touch, invisible, overlapping)
                all_issues.extend(issues)
                device_results.append({
                    "device": device, "width": vp["width"], "height": vp["height"], "issues": issues,
                    "probes": {"overflow_count": len(overflow), "img_overflow_count": len(img_overflow),
                               "small_targets": len(touch), "invisible_blocks": len(invisible), "overlapping_pairs": len(overlapping)},
                })
            except PWTimeout:
                logger.warning("Playwright timeout on %s @ %s", device, url)
                device_results.append({"device": device, "width": vp["width"], "height": vp["height"],
                    "issues": [{"severity": "info", "title": f"Page load timeout at {device}",
                                "description": "The page took too long to load at this viewport.",
                                "device": device.capitalize(), "source": "playwright"}], "probes": {}})
            except Exception as exc:
                logger.error("Playwright error on %s: %s", device, exc)
                device_results.append({"device": device, "width": vp["width"], "height": vp["height"], "issues": [], "probes": {}})
            finally:
                context.close()
        browser.close()

    return {
        "screenshots":    screenshots,
        "device_results": device_results,
        "issues":         all_issues,
        "suggestions":    _resolution_suggestions(device_results),
        "playwright_ok":  True,
    }
