import re
import logging
import requests
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; ResponsiveTool/1.0; +https://github.com/responsive-tool)"
}
FETCH_TIMEOUT = 15


def _fetch(url: str):
    resp = requests.get(url, headers=HEADERS, timeout=FETCH_TIMEOUT, allow_redirects=True)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")
    inline_css = [tag.get_text() for tag in soup.find_all("style")]
    linked_css = []
    base = resp.url.rstrip("/")
    for link in soup.find_all("link", rel=lambda r: r and "stylesheet" in r)[:3]:
        href = link.get("href", "")
        if not href:
            continue
        if href.startswith("//"):
            href = "https:" + href
        elif href.startswith("/"):
            from urllib.parse import urlparse
            p = urlparse(base)
            href = f"{p.scheme}://{p.netloc}{href}"
        elif not href.startswith("http"):
            href = base + "/" + href
        try:
            cr = requests.get(href, headers=HEADERS, timeout=10)
            if cr.ok:
                linked_css.append(cr.text)
        except Exception:
            pass
    return soup, inline_css, linked_css


def _all_css(inline_css, linked_css):
    return "\n".join(inline_css + linked_css)


def check_viewport_meta(soup):
    issues, suggestions = [], []
    meta = soup.find("meta", attrs={"name": re.compile(r"^viewport$", re.I)})
    if not meta:
        issues.append({"severity": "critical", "title": "Missing viewport meta tag",
            "description": "No <meta name=\"viewport\"> found. Mobile browsers will render at desktop width.",
            "device": "Mobile, Tablet"})
        suggestions.append({"category": "viewport", "title": "Add viewport meta tag",
            "detail": "Add <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"> in <head>."})
    else:
        content = meta.get("content", "")
        if "width=device-width" not in content:
            issues.append({"severity": "warning", "title": "Viewport meta missing width=device-width",
                "description": f"Current content: \"{content}\". Without width=device-width the page won't scale correctly.",
                "device": "Mobile, Tablet"})
            suggestions.append({"category": "viewport", "title": "Fix viewport meta content",
                "detail": "Set content=\"width=device-width, initial-scale=1\" on your viewport meta tag."})
        if "user-scalable=no" in content or "maximum-scale=1" in content:
            suggestions.append({"category": "viewport", "title": "Allow user zoom",
                "detail": "Remove user-scalable=no and maximum-scale=1 from your viewport meta tag."})
    return issues, suggestions


def check_media_queries(css_text):
    issues, suggestions = [], []
    if not re.search(r"@media\s*\(", css_text, re.I):
        suggestions.append({"category": "layout", "title": "Add responsive media queries",
            "detail": "If the rendered scan shows layout problems, add breakpoint rules such as @media (max-width: 768px) { ... }."})
    elif not re.search(r"@media[^{]*(?:max-width\s*:\s*(?:480|600|767|768)px|min-width\s*:\s*(?:320|375|414)px)", css_text, re.I):
        suggestions.append({"category": "layout", "title": "Add a mobile breakpoint",
            "detail": "If mobile screenshots show layout problems, add @media (max-width: 768px) { ... } rules."})
    return issues, suggestions
    if not re.search(r"@media\s*\(", css_text, re.I):
        suggestions.append({"category": "layout", "title": "Add responsive media queries",
            "detail": "Use @media (max-width: 768px) { … } breakpoints to adjust layout for smaller screens."})
    else:
        if not re.search(r"@media[^{]*(?:max-width\s*:\s*(?:480|600|767|768)px|min-width\s*:\s*(?:320|375|414)px)", css_text, re.I):
            """
                "description": "Media queries exist but none target common mobile widths (≤768px).",
            """
            suggestions.append({"category": "layout", "title": "Add a mobile breakpoint",
                "detail": "Add @media (max-width: 768px) { … } rules to handle mobile layouts explicitly."})
    return issues, suggestions


def check_fixed_widths(css_text):
    issues, suggestions = [], []
    large_fixed = [int(v) for v in re.findall(r"width\s*:\s*(\d+)px", css_text) if int(v) > 480]
    if large_fixed:
        suggestions.append({"category": "layout", "title": "Review fixed widths",
            "detail": f"Found {len(large_fixed)} CSS width rule(s) over 480px. If rendered overflow appears, replace fixed widths with max-width, %, or vw units."})
    return issues, suggestions
    if large_fixed:
        issues.append({"severity": "warning", "title": f"Fixed-width elements detected (largest: {max(large_fixed)}px)",
            "description": f"Found {len(large_fixed)} CSS rule(s) with fixed pixel widths > 480px. These will overflow on mobile.",
            "device": "Mobile, Tablet"})
        suggestions.append({"category": "layout", "title": "Replace fixed widths with fluid units",
            "detail": "Use max-width instead of width, or switch to percentage / vw units."})
    return issues, suggestions


def check_images(soup, css_text):
    issues, suggestions = [], []
    imgs = soup.find_all("img")
    fixed_imgs = [img.get("width") for img in imgs if img.get("width") and str(img.get("width")).isdigit() and int(img.get("width")) > 480]
    if fixed_imgs:
        suggestions.append({"category": "images", "title": "Make images fluid",
            "detail": "Remove fixed width/height attributes and add img { max-width: 100%; height: auto; } to CSS."})
    imgs_without_srcset = [i for i in imgs if not i.get("srcset") and not i.get("sizes")]
    if len(imgs_without_srcset) > 3:
        suggestions.append({"category": "images", "title": "Use srcset for responsive images",
            "detail": f"{len(imgs_without_srcset)} images lack srcset/sizes. Add srcset to serve appropriately sized images."})
    return issues, suggestions
    if fixed_imgs:
        issues.append({"severity": "warning", "title": f"{len(fixed_imgs)} image(s) with fixed width attribute",
            "description": "Images with hard-coded width attributes won't scale down on small screens.",
            "device": "Mobile, Tablet"})
        suggestions.append({"category": "images", "title": "Make images fluid",
            "detail": "Remove fixed width/height attributes and add img { max-width: 100%; height: auto; } to CSS."})
    imgs_without_srcset = [i for i in imgs if not i.get("srcset") and not i.get("sizes")]
    if len(imgs_without_srcset) > 3:
        suggestions.append({"category": "images", "title": "Use srcset for responsive images",
            "detail": f"{len(imgs_without_srcset)} images lack srcset/sizes. Add srcset to serve appropriately sized images."})
    return issues, suggestions


def check_font_sizes(css_text):
    issues, suggestions = [], []
    tiny_vals = [int(v) for v in re.findall(r"font-size\s*:\s*(\d+)px", css_text) if int(v) < 12]
    if tiny_vals:
        suggestions.append({"category": "typography", "title": "Review small font sizes",
            "detail": f"Found {len(tiny_vals)} font-size rule(s) below 12px. Confirm readability in the rendered screenshots."})
    px_fonts = re.findall(r"font-size\s*:\s*\d+px", css_text)
    if len(px_fonts) > 5:
        suggestions.append({"category": "typography", "title": "Use relative font units",
            "detail": f"Found {len(px_fonts)} px-based font-size rules. Switch to rem/em for better scaling."})
    return issues, suggestions
    if tiny_vals:
        issues.append({"severity": "warning", "title": f"Small font sizes detected ({min(tiny_vals)}px)",
            "description": f"Found {len(tiny_vals)} font-size rule(s) below 12px. Text may be unreadable on mobile.",
            "device": "Mobile"})
    px_fonts = re.findall(r"font-size\s*:\s*\d+px", css_text)
    if len(px_fonts) > 5:
        suggestions.append({"category": "typography", "title": "Use relative font units",
            "detail": f"Found {len(px_fonts)} px-based font-size rules. Switch to rem/em for better scaling."})
    return issues, suggestions


def check_touch_targets(soup, css_text):
    issues, suggestions = [], []
    btn_small = re.findall(r"(?:button|\.btn)[^{]*\{[^}]*height\s*:\s*([1-3]\d)px", css_text, re.I)
    if btn_small:
        suggestions.append({"category": "touch", "title": "Increase touch target size",
            "detail": "For mobile controls, aim for comfortable tap targets around 44x44px."})
    return issues, suggestions
    if btn_small:
        issues.append({"severity": "warning", "title": "Small touch targets",
            "description": "Some buttons/links appear to have heights below 44px, making them hard to tap.",
            "device": "Mobile, Tablet"})
        suggestions.append({"category": "touch", "title": "Increase touch target size",
            "detail": "Ensure all interactive elements are at least 44×44px (WCAG 2.5.5)."})
    return issues, suggestions


def check_horizontal_scroll(soup):
    issues, suggestions = [], []
    unwrapped = [t for t in soup.find_all("table")
                 if "overflow" not in " ".join(t.parent.get("class", [])) and
                    "scroll" not in " ".join(t.parent.get("class", []))]
    if unwrapped:
        suggestions.append({"category": "layout", "title": "Wrap wide tables",
            "detail": "If tables overflow in rendered screenshots, wrap them in a container with overflow-x: auto."})
    return issues, suggestions
    if unwrapped:
        issues.append({"severity": "warning", "title": f"{len(unwrapped)} table(s) may cause horizontal scroll",
            "description": "Tables without a scrollable wrapper overflow on narrow screens.",
            "device": "Mobile, Tablet"})
        suggestions.append({"category": "layout", "title": "Wrap tables in a scrollable container",
            "detail": "Wrap <table> elements in <div style=\"overflow-x: auto\"> to prevent horizontal overflow."})
    return issues, suggestions


def check_flexbox_grid(css_text):
    has_flex  = bool(re.search(r"display\s*:\s*flex", css_text, re.I))
    has_grid  = bool(re.search(r"display\s*:\s*grid", css_text, re.I))
    has_float = bool(re.search(r"float\s*:\s*(left|right)", css_text, re.I))
    suggestions = []
    if has_float and not has_flex and not has_grid:
        suggestions.append({"category": "layout", "title": "Migrate float layouts to Flexbox/Grid",
            "detail": "Float-based layouts are fragile on small screens. CSS Flexbox and Grid are robust alternatives."})
    return [], suggestions


def _compute_score(issues):
    deductions = {"critical": 20, "warning": 8, "info": 2}
    score = 100.0
    for issue in issues:
        score -= deductions.get(issue.get("severity", "info"), 2)
    return max(0.0, score)


def analyze(url: str) -> dict:
    soup, inline_css, linked_css = _fetch(url)
    css_text = _all_css(inline_css, linked_css)
    all_issues, all_suggestions, checks_run = [], [], []

    checks = [
        ("viewport_meta",     lambda: check_viewport_meta(soup)),
        ("media_queries",     lambda: check_media_queries(css_text)),
        ("fixed_widths",      lambda: check_fixed_widths(css_text)),
        ("images",            lambda: check_images(soup, css_text)),
        ("font_sizes",        lambda: check_font_sizes(css_text)),
        ("touch_targets",     lambda: check_touch_targets(soup, css_text)),
        ("horizontal_scroll", lambda: check_horizontal_scroll(soup)),
        ("flexbox_grid",      lambda: check_flexbox_grid(css_text)),
    ]

    for name, fn in checks:
        try:
            issues, suggestions = fn()
            all_issues.extend(issues)
            all_suggestions.extend(suggestions)
            checks_run.append(name)
        except Exception as exc:
            logger.warning("Check %s failed: %s", name, exc)

    seen = set()
    unique_suggestions = [s for s in all_suggestions if s["title"] not in seen and not seen.add(s["title"])]

    return {
        "score": _compute_score(all_issues),
        "issues": all_issues,
        "suggestions": unique_suggestions,
        "raw_result": {"url": url, "checks_run": checks_run, "css_sources": len(inline_css) + len(linked_css)},
    }
