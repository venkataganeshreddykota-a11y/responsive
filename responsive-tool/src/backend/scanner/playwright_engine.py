import base64
import logging

logger = logging.getLogger(__name__)

from .devices import DEVICE_LIBRARY, DEFAULT_DEVICES

PAGE_TIMEOUT    = 30_000
WAIT_AFTER_LOAD = 2_000

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


def run_playwright_scan(url: str, selected_devices: list = None) -> dict:
    from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

    screenshots: dict = {}
    device_results: list = []
    all_issues: list = []

    # Filter devices from library
    target_keys = selected_devices if selected_devices else DEFAULT_DEVICES
    viewports = []
    for key in target_keys:
        if key in DEVICE_LIBRARY:
            viewports.append({**DEVICE_LIBRARY[key], "key": key})
    
    if not viewports:
        for key in DEFAULT_DEVICES:
            viewports.append({**DEVICE_LIBRARY[key], "key": key})

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        for vp in viewports:
            key = vp["key"]
            name = vp["name"]
            logger.info("Playwright scanning %s @ %dpx", name, vp["width"])
            context = browser.new_context(
                viewport={"width": vp["width"], "height": vp["height"]},
                is_mobile=vp["is_mobile"],
                device_scale_factor=vp["device_scale_factor"],
                user_agent=(
                    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1"
                    if vp["is_mobile"] else
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36"
                ),
            )
            page = context.new_page()
            try:
                page.goto(url, wait_until="networkidle", timeout=PAGE_TIMEOUT)
                page.wait_for_timeout(WAIT_AFTER_LOAD)
                png_bytes = page.screenshot(full_page=True, type="png")
                screenshots[key] = base64.b64encode(png_bytes).decode("utf-8")
                
                overflow     = page.evaluate(_JS_OVERFLOW)       or []
                img_overflow = page.evaluate(_JS_IMAGE_OVERFLOW) or []
                touch        = page.evaluate(_JS_TOUCH_TARGETS)  or []
                invisible    = page.evaluate(_JS_INVISIBLE_BLOCKS) or []
                overlapping  = page.evaluate(_JS_OVERLAPPING)    or []
                
                issues = _build_issues(name, overflow, img_overflow, touch, invisible, overlapping)
                all_issues.extend(issues)
                
                device_results.append({
                    "device": key,
                    "device_name": name,
                    "width": vp["width"],
                    "height": vp["height"],
                    "icon": vp.get("icon", "📱"),
                    "category": vp.get("category", "Mobile"),
                    "issues": issues,
                    "probes": {"overflow_count": len(overflow), "img_overflow_count": len(img_overflow),
                               "small_targets": len(touch), "invisible_blocks": len(invisible), "overlapping_pairs": len(overlapping)},
                })
            except PWTimeout:
                logger.warning("Playwright timeout on %s @ %s", name, url)
                device_results.append({
                    "device": key, "device_name": name, "width": vp["width"], "height": vp["height"],
                    "icon": vp.get("icon", "📱"), "category": vp.get("category", "Mobile"),
                    "issues": [{"severity": "info", "title": f"Page load timeout at {name}",
                                "description": "The page took too long to load at this viewport.",
                                "device": name, "source": "playwright"}], "probes": {}})
            except Exception as exc:
                logger.error("Playwright error on %s: %s", name, exc)
                device_results.append({
                    "device": key, "device_name": name, "width": vp["width"], "height": vp["height"],
                    "icon": vp.get("icon", "📱"), "category": vp.get("category", "Mobile"),
                    "issues": [], "probes": {}})
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
