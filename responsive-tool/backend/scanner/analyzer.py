"""
Responsiveness analyzer.
Fetches a URL, parses HTML/CSS, and returns structured issues + suggestions + score.
"""
import re
import logging
import requests
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

DEVICE_BREAKPOINTS = {
    "mobile":  375,
    "tablet":  768,
    "laptop":  1280,
    "desktop": 1920,
}

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (compatible; ResponsiveTool/1.0; +https://github.com/responsive-tool)"
    )
}

FETCH_TIMEOUT = 15  # seconds


# ── helpers ──────────────────────────────────────────────────────────────────

def _fetch(url: str):
    """Return (html_text, inline_css_blocks, linked_css_texts) or raise."""
    resp = requests.get(url, headers=HEADERS, timeout=FETCH_TIMEOUT, allow_redirects=True)
    resp.raise_for_status()
    html = resp.text
    soup = BeautifulSoup(html, "html.parser")

    # collect inline <style> blocks
    inline_css = [tag.get_text() for tag in soup.find_all("style")]

    # try to fetch up to 3 external stylesheets
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


# ── individual checks ─────────────────────────────────────────────────────────

def check_viewport_meta(soup):
    """Missing or misconfigured viewport meta tag."""
    issues = []
    suggestions = []
    meta = soup.find("meta", attrs={"name": re.compile(r"^viewport$", re.I)})
    if not meta:
        issues.append({
            "severity": "critical",
            "title": "Missing viewport meta tag",
            "description": (
                "No <meta name=\"viewport\"> found. Mobile browsers will render the page "
                "at desktop width and scale it down, breaking the layout."
            ),
            "device": "Mobile, Tablet",
        })
        suggestions.append({
            "category": "viewport",
            "title": "Add viewport meta tag",
            "detail": (
                "Add <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"> "
                "inside your <head> element."
            ),
        })
    else:
        content = meta.get("content", "")
        if "width=device-width" not in content:
            issues.append({
                "severity": "warning",
                "title": "Viewport meta missing width=device-width",
                "description": f"Current content: \"{content}\". Without width=device-width the page won't scale correctly.",
                "device": "Mobile, Tablet",
            })
            suggestions.append({
                "category": "viewport",
                "title": "Fix viewport meta content",
                "detail": "Set content=\"width=device-width, initial-scale=1\" on your viewport meta tag.",
            })
        if "user-scalable=no" in content or "maximum-scale=1" in content:
            issues.append({
                "severity": "warning",
                "title": "Zoom disabled for users",
                "description": "user-scalable=no or maximum-scale=1 prevents users from zooming, harming accessibility.",
                "device": "Mobile",
            })
            suggestions.append({
                "category": "viewport",
                "title": "Allow user zoom",
                "detail": "Remove user-scalable=no and maximum-scale=1 from your viewport meta tag.",
            })
    return issues, suggestions


def check_media_queries(css_text):
    """Detect absence of responsive media queries."""
    issues = []
    suggestions = []
    mq_pattern = re.compile(r"@media\s*\(", re.I)
    if not mq_pattern.search(css_text):
        issues.append({
            "severity": "critical",
            "title": "No CSS media queries detected",
            "description": (
                "No @media rules were found in any stylesheet. "
                "The layout will not adapt to different screen sizes."
            ),
            "device": "Mobile, Tablet, Laptop",
        })
        suggestions.append({
            "category": "layout",
            "title": "Add responsive media queries",
            "detail": (
                "Use @media (max-width: 768px) { … } breakpoints to adjust layout, "
                "font sizes, and spacing for smaller screens."
            ),
        })
    else:
        # check for common mobile breakpoint
        mobile_mq = re.compile(r"@media[^{]*(?:max-width\s*:\s*(?:480|600|767|768)px|min-width\s*:\s*(?:320|375|414)px)", re.I)
        if not mobile_mq.search(css_text):
            issues.append({
                "severity": "warning",
                "title": "No mobile-specific breakpoint found",
                "description": "Media queries exist but none target common mobile widths (≤768px).",
                "device": "Mobile",
            })
            suggestions.append({
                "category": "layout",
                "title": "Add a mobile breakpoint",
                "detail": "Add @media (max-width: 768px) { … } rules to handle mobile layouts explicitly.",
            })
    return issues, suggestions


def check_fixed_widths(css_text):
    """Detect fixed pixel widths that may overflow on small screens."""
    issues = []
    suggestions = []
    # look for width: NNNpx where NNN > 480
    fixed = re.findall(r"width\s*:\s*(\d+)px", css_text)
    large_fixed = [int(v) for v in fixed if int(v) > 480]
    if large_fixed:
        worst = max(large_fixed)
        issues.append({
            "severity": "warning",
            "title": f"Fixed-width elements detected (largest: {worst}px)",
            "description": (
                f"Found {len(large_fixed)} CSS rule(s) with fixed pixel widths > 480px. "
                "These will overflow on mobile screens."
            ),
            "device": "Mobile, Tablet",
        })
        suggestions.append({
            "category": "layout",
            "title": "Replace fixed widths with fluid units",
            "detail": (
                "Use max-width instead of width, or switch to percentage / vw units. "
                "Example: max-width: 100%; width: 100%."
            ),
        })
    return issues, suggestions


def check_images(soup, css_text):
    """Check for non-responsive images."""
    issues = []
    suggestions = []
    imgs = soup.find_all("img")
    fixed_imgs = []
    for img in imgs:
        w = img.get("width", "")
        if w and str(w).isdigit() and int(w) > 480:
            fixed_imgs.append(w)

    if fixed_imgs:
        issues.append({
            "severity": "warning",
            "title": f"{len(fixed_imgs)} image(s) with fixed width attribute",
            "description": "Images with hard-coded width attributes won't scale down on small screens.",
            "device": "Mobile, Tablet",
        })
        suggestions.append({
            "category": "images",
            "title": "Make images fluid",
            "detail": (
                "Remove fixed width/height attributes from <img> tags and add "
                "img { max-width: 100%; height: auto; } to your CSS."
            ),
        })

    # check for missing srcset on large images
    imgs_without_srcset = [i for i in imgs if not i.get("srcset") and not i.get("sizes")]
    if len(imgs_without_srcset) > 3:
        suggestions.append({
            "category": "images",
            "title": "Use srcset for responsive images",
            "detail": (
                f"{len(imgs_without_srcset)} images lack srcset/sizes attributes. "
                "Add srcset to serve appropriately sized images per device."
            ),
        })

    return issues, suggestions


def check_font_sizes(css_text):
    """Detect small fixed font sizes."""
    issues = []
    suggestions = []
    # font-size: Npx where N < 12
    tiny = re.findall(r"font-size\s*:\s*(\d+)px", css_text)
    tiny_vals = [int(v) for v in tiny if int(v) < 12]
    if tiny_vals:
        issues.append({
            "severity": "warning",
            "title": f"Small font sizes detected ({min(tiny_vals)}px)",
            "description": (
                f"Found {len(tiny_vals)} font-size rule(s) below 12px. "
                "Text may be unreadable on mobile devices."
            ),
            "device": "Mobile",
        })

    # check for px-based font sizes (suggest rem)
    px_fonts = re.findall(r"font-size\s*:\s*\d+px", css_text)
    if len(px_fonts) > 5:
        suggestions.append({
            "category": "typography",
            "title": "Use relative font units",
            "detail": (
                f"Found {len(px_fonts)} px-based font-size rules. "
                "Switch to rem/em so text scales with user browser preferences."
            ),
        })
    return issues, suggestions


def check_touch_targets(soup, css_text):
    """Check for potentially small interactive elements."""
    issues = []
    suggestions = []
    buttons = soup.find_all(["button", "a", "input"])
    # heuristic: look for height/width < 44px on interactive elements
    small_targets = re.findall(r"(?:height|width)\s*:\s*([1-3]\d)px", css_text)
    if small_targets or len(buttons) > 0:
        # check CSS for very small heights on buttons
        btn_small = re.findall(r"(?:button|\.btn)[^{]*\{[^}]*height\s*:\s*([1-3]\d)px", css_text, re.I)
        if btn_small:
            issues.append({
                "severity": "warning",
                "title": "Small touch targets",
                "description": (
                    "Some buttons/links appear to have heights below 44px, "
                    "making them hard to tap on touchscreens."
                ),
                "device": "Mobile, Tablet",
            })
            suggestions.append({
                "category": "touch",
                "title": "Increase touch target size",
                "detail": "Ensure all interactive elements are at least 44×44px (WCAG 2.5.5).",
            })
    return issues, suggestions


def check_horizontal_scroll(soup):
    """Detect overflow-x issues."""
    issues = []
    suggestions = []
    # look for tables without responsive wrappers
    tables = soup.find_all("table")
    unwrapped = []
    for t in tables:
        parent = t.parent
        parent_class = " ".join(parent.get("class", [])) if parent else ""
        if "overflow" not in parent_class and "scroll" not in parent_class:
            unwrapped.append(t)
    if unwrapped:
        issues.append({
            "severity": "warning",
            "title": f"{len(unwrapped)} table(s) may cause horizontal scroll",
            "description": "Tables without a scrollable wrapper overflow on narrow screens.",
            "device": "Mobile, Tablet",
        })
        suggestions.append({
            "category": "layout",
            "title": "Wrap tables in a scrollable container",
            "detail": "Wrap <table> elements in <div style=\"overflow-x: auto\"> to prevent horizontal overflow.",
        })
    return issues, suggestions


def check_flexbox_grid(css_text):
    """Encourage modern layout methods."""
    suggestions = []
    has_flex = bool(re.search(r"display\s*:\s*flex", css_text, re.I))
    has_grid = bool(re.search(r"display\s*:\s*grid", css_text, re.I))
    has_float = bool(re.search(r"float\s*:\s*(left|right)", css_text, re.I))

    if has_float and not has_flex and not has_grid:
        suggestions.append({
            "category": "layout",
            "title": "Migrate float layouts to Flexbox/Grid",
            "detail": (
                "Float-based layouts are fragile on small screens. "
                "CSS Flexbox and Grid provide robust, responsive alternatives."
            ),
        })
    return [], suggestions


# ── scoring ───────────────────────────────────────────────────────────────────

def _compute_score(issues):
    """
    Start at 100. Deduct per issue severity.
    critical: -20, warning: -8, info: -2. Floor at 0.
    """
    deductions = {"critical": 20, "warning": 8, "info": 2}
    score = 100.0
    for issue in issues:
        score -= deductions.get(issue.get("severity", "info"), 2)
    return max(0.0, score)


# ── public entry point ────────────────────────────────────────────────────────

def analyze(url: str) -> dict:
    """
    Fetch and analyze a URL for responsiveness.
    Returns:
        {
            "score": float,
            "issues": [...],
            "suggestions": [...],
            "raw_result": { "url": str, "checks_run": [...] }
        }
    """
    soup, inline_css, linked_css = _fetch(url)
    css_text = _all_css(inline_css, linked_css)

    all_issues = []
    all_suggestions = []
    checks_run = []

    checks = [
        ("viewport_meta",    lambda: check_viewport_meta(soup)),
        ("media_queries",    lambda: check_media_queries(css_text)),
        ("fixed_widths",     lambda: check_fixed_widths(css_text)),
        ("images",           lambda: check_images(soup, css_text)),
        ("font_sizes",       lambda: check_font_sizes(css_text)),
        ("touch_targets",    lambda: check_touch_targets(soup, css_text)),
        ("horizontal_scroll",lambda: check_horizontal_scroll(soup)),
        ("flexbox_grid",     lambda: check_flexbox_grid(css_text)),
    ]

    for name, fn in checks:
        try:
            issues, suggestions = fn()
            all_issues.extend(issues)
            all_suggestions.extend(suggestions)
            checks_run.append(name)
        except Exception as exc:
            logger.warning("Check %s failed: %s", name, exc)

    # deduplicate suggestions by title
    seen = set()
    unique_suggestions = []
    for s in all_suggestions:
        if s["title"] not in seen:
            seen.add(s["title"])
            unique_suggestions.append(s)

    score = _compute_score(all_issues)

    return {
        "score": score,
        "issues": all_issues,
        "suggestions": unique_suggestions,
        "raw_result": {
            "url": url,
            "checks_run": checks_run,
            "css_sources": len(inline_css) + len(linked_css),
        },
    }
