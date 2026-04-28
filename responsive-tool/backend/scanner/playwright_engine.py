"""
Playwright automation engine.

For each viewport:
  1. Opens the URL in headless Chromium
  2. Captures a full-page screenshot → base64 PNG
  3. Runs JS probes to detect:
       - Horizontal overflow (elements wider than viewport)
       - Image overflow (img wider than its container)
       - Tiny touch targets (interactive elements < 44px)
       - Zero-height / invisible blocks
       - Overlapping elements (z-index / position collisions)
  4. Derives per-device issues + resolution suggestions
  5. Returns a dict consumed by tasks.py
"""

import base64
import logging
from typing import Optional

logger = logging.getLogger(__name__)

# ── Viewport definitions ──────────────────────────────────────────────────────

VIEWPORTS = [
    {"name": "mobile",  "width": 375,  "height": 812,  "is_mobile": True,  "device_scale_factor": 2},
    {"name": "tablet",  "width": 768,  "height": 1024, "is_mobile": True,  "device_scale_factor": 2},
    {"name": "laptop",  "width": 1280, "height": 800,  "is_mobile": False, "device_scale_factor": 1},
    {"name": "desktop", "width": 1440, "height": 900,  "is_mobile": False, "device_scale_factor": 1},
]

PAGE_TIMEOUT    = 30_000   # ms — navigation timeout
WAIT_AFTER_LOAD = 2_000    # ms — settle time after networkidle

# ── JS probes ─────────────────────────────────────────────────────────────────

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
            issues.push({
                src: img.src.slice(0, 100),
                imgWidth: Math.round(ir.width),
                containerWidth: Math.round(pr.width),
                overflow: Math.round(ir.width - pr.width),
            });
        }
    });
    return issues.slice(0, 10);
}
"""

_JS_TOUCH_TARGETS = """
() => {
    const MIN = 44;
    const issues = [];
    const selectors = 'a, button, input, select, textarea, [role="button"], [tabindex]';
    document.querySelectorAll(selectors).forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0 && (r.width < MIN || r.height < MIN)) {
            const tag = el.tagName.toLowerCase();
            const label = el.textContent.trim().slice(0, 30)
                          || el.getAttribute('aria-label')
                          || el.getAttribute('placeholder')
                          || '';
            issues.push({
                tag,
                label,
                width: Math.round(r.width),
                height: Math.round(r.height),
            });
        }
    });
    return issues.slice(0, 10);
}
"""

_JS_INVISIBLE_BLOCKS = """
() => {
    const issues = [];
    const tags = ['section','article','main','aside','header','footer','nav','div'];
    tags.forEach(t => {
        document.querySelectorAll(t).forEach(el => {
            const r = el.getBoundingClientRect();
            const style = window.getComputedStyle(el);
            if (r.width > 100 && r.height === 0 && style.display !== 'none') {
                const id  = el.id ? '#' + el.id : '';
                const cls = (typeof el.className === 'string' && el.className.trim())
                            ? '.' + el.className.trim().split(/\\s+/)[0]
                            : '';
                issues.push({ selector: t + id + cls, width: Math.round(r.width) });
            }
        });
    });
    return issues.slice(0, 5);
}
"""

_JS_OVERLAPPING = """
() => {
    const positioned = Array.from(
        document.querySelectorAll('*')
    ).filter(el => {
        const s = window.getComputedStyle(el);
        return (s.position === 'absolute' || s.position === 'fixed')
               && s.display !== 'none';
    });
    const issues = [];
    for (let i = 0; i < Math.min(positioned.length, 60); i++) {
        const a = positioned[i].getBoundingClientRect();
        for (let j = i + 1; j < Math.min(positioned.length, 60); j++) {
            const b = positioned[j].getBoundingClientRect();
            const overlap = !(a.right < b.left || b.right < a.left ||
                               a.bottom < b.top || b.bottom < a.top);
            if (overlap && a.width > 20 && b.width > 20) {
                const tagA = positioned[i].tagName.toLowerCase();
                const tagB = positioned[j].tagName.toLowerCase();
                issues.push({ elements: `${tagA} ↔ ${tagB}` });
                if (issues.length >= 5) return issues;
            }
        }
    }
    return issues;
}
"""

# ── resolution advisor ────────────────────────────────────────────────────────

def _resolution_suggestions(device_results: list) -> list:
    """
    Cross-device analysis: recommend optimal breakpoints based on
    which viewports had overflow or layout issues.
    """
    suggestions = []
    broken = [r["device"] for r in device_results if r["issues"]]

    if "mobile" in broken:
        suggestions.append({
            "category": "viewport",
            "title": "Optimise for 375px (iPhone SE / standard mobile)",
            "detail": (
                "Layout issues detected at 375px. Add or tighten your mobile breakpoint: "
                "@media (max-width: 480px) { … }"
            ),
        })
    if "tablet" in broken:
        suggestions.append({
            "category": "layout",
            "title": "Optimise for 768px (iPad / tablet)",
            "detail": (
                "Issues found at 768px. Add a tablet breakpoint: "
                "@media (min-width: 481px) and (max-width: 1024px) { … }"
            ),
        })
    if "laptop" in broken:
        suggestions.append({
            "category": "layout",
            "title": "Optimise for 1280px (laptop)",
            "detail": (
                "Issues found at 1280px. Ensure your main container uses "
                "max-width: 1200px with auto margins."
            ),
        })
    if not broken:
        suggestions.append({
            "category": "performance",
            "title": "All viewports look clean",
            "detail": (
                "No overflow or layout issues detected across 375px, 768px, 1280px, 1440px. "
                "Consider adding 320px (small mobile) and 2560px (4K) checks."
            ),
        })

    # always recommend these best-practices
    suggestions.append({
        "category": "images",
        "title": "Serve next-gen image formats",
        "detail": "Use WebP/AVIF with <picture> + srcset to reduce payload on mobile networks.",
    })
    suggestions.append({
        "category": "performance",
        "title": "Test on real devices",
        "detail": (
            "Automated viewport emulation doesn't replicate real device rendering. "
            "Verify on physical iOS and Android devices for final sign-off."
        ),
    })
    return suggestions


# ── per-device issue builder ──────────────────────────────────────────────────

def _build_issues(device: str, overflow, img_overflow, touch, invisible, overlapping) -> list:
    issues = []

    if overflow:
        worst = max(overflow, key=lambda x: x["overflow"])
        issues.append({
            "severity": "critical",
            "title": f"Horizontal overflow at {device} ({worst['overflow']}px beyond viewport)",
            "description": (
                f"{len(overflow)} element(s) exceed the {worst['viewportWidth']}px viewport width. "
                f"Worst offender: `{worst['selector']}` ({worst['elementWidth']}px wide)."
            ),
            "device": device.capitalize(),
            "source": "playwright",
        })

    if img_overflow:
        issues.append({
            "severity": "warning",
            "title": f"{len(img_overflow)} image(s) overflow their container at {device}",
            "description": (
                f"Images are wider than their parent containers. "
                f"Add `img {{ max-width: 100%; height: auto; }}` to fix."
            ),
            "device": device.capitalize(),
            "source": "playwright",
        })

    if touch:
        issues.append({
            "severity": "warning",
            "title": f"{len(touch)} small touch target(s) at {device}",
            "description": (
                f"Interactive elements smaller than 44×44px found. "
                f"Example: <{touch[0]['tag']}> is {touch[0]['width']}×{touch[0]['height']}px."
            ),
            "device": device.capitalize(),
            "source": "playwright",
        })

    if invisible:
        issues.append({
            "severity": "info",
            "title": f"{len(invisible)} zero-height block(s) at {device}",
            "description": (
                "Visible-width containers with zero height detected — likely collapsed flex/grid parents "
                "or missing content. Check: " + ", ".join(i["selector"] for i in invisible[:3])
            ),
            "device": device.capitalize(),
            "source": "playwright",
        })

    if overlapping:
        issues.append({
            "severity": "warning",
            "title": f"Overlapping positioned elements at {device}",
            "description": (
                f"{len(overlapping)} pair(s) of absolutely/fixed-positioned elements overlap. "
                "This can hide content or break the UI at this viewport."
            ),
            "device": device.capitalize(),
            "source": "playwright",
        })

    return issues


# ── main entry point ──────────────────────────────────────────────────────────

def run_playwright_scan(url: str) -> dict:
    """
    Run a full Playwright scan across all viewports.

    Returns:
        {
            "screenshots": { "mobile": "<base64>", "tablet": ..., ... },
            "device_results": [
                { "device": "mobile", "width": 375, "issues": [...] },
                ...
            ],
            "issues": [...],          # merged, deduplicated
            "suggestions": [...],
            "playwright_ok": True,
        }
    """
    from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

    screenshots: dict[str, str] = {}
    device_results: list = []
    all_issues: list = []

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)

        for vp in VIEWPORTS:
            device = vp["name"]
            logger.info("Playwright scanning %s @ %dpx", device, vp["width"])

            context = browser.new_context(
                viewport={"width": vp["width"], "height": vp["height"]},
                is_mobile=vp["is_mobile"],
                device_scale_factor=vp["device_scale_factor"],
                user_agent=(
                    "Mozilla/5.0 (Linux; Android 11; Pixel 5) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/124.0 Mobile Safari/537.36"
                ) if vp["is_mobile"] else (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/124.0 Safari/537.36"
                ),
            )
            page = context.new_page()

            try:
                page.goto(url, wait_until="networkidle", timeout=PAGE_TIMEOUT)
                page.wait_for_timeout(WAIT_AFTER_LOAD)

                # ── screenshot ──
                png_bytes = page.screenshot(full_page=True, type="png")
                screenshots[device] = base64.b64encode(png_bytes).decode("utf-8")

                # ── JS probes ──
                overflow     = page.evaluate(_JS_OVERFLOW)     or []
                img_overflow = page.evaluate(_JS_IMAGE_OVERFLOW) or []
                touch        = page.evaluate(_JS_TOUCH_TARGETS) or []
                invisible    = page.evaluate(_JS_INVISIBLE_BLOCKS) or []
                overlapping  = page.evaluate(_JS_OVERLAPPING)  or []

                issues = _build_issues(device, overflow, img_overflow, touch, invisible, overlapping)
                all_issues.extend(issues)
                device_results.append({
                    "device": device,
                    "width": vp["width"],
                    "height": vp["height"],
                    "issues": issues,
                    "probes": {
                        "overflow_count":     len(overflow),
                        "img_overflow_count": len(img_overflow),
                        "small_targets":      len(touch),
                        "invisible_blocks":   len(invisible),
                        "overlapping_pairs":  len(overlapping),
                    },
                })

            except PWTimeout:
                logger.warning("Playwright timeout on %s @ %s", device, url)
                device_results.append({
                    "device": device, "width": vp["width"], "height": vp["height"],
                    "issues": [{
                        "severity": "info",
                        "title": f"Page load timeout at {device}",
                        "description": "The page took too long to load at this viewport.",
                        "device": device.capitalize(),
                        "source": "playwright",
                    }],
                    "probes": {},
                })
            except Exception as exc:
                logger.error("Playwright error on %s: %s", device, exc)
                device_results.append({
                    "device": device, "width": vp["width"], "height": vp["height"],
                    "issues": [], "probes": {},
                })
            finally:
                context.close()

        browser.close()

    suggestions = _resolution_suggestions(device_results)

    return {
        "screenshots":   screenshots,
        "device_results": device_results,
        "issues":        all_issues,
        "suggestions":   suggestions,
        "playwright_ok": True,
    }
