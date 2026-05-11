import logging
import requests
from bs4 import BeautifulSoup

from .css_analyzer import (
    check_media_queries,
    check_fixed_widths,
    check_font_sizes,
    check_flexbox_grid,
)
from .accessibility_analyzer import (
    check_viewport_meta,
    check_images,
    check_touch_targets,
    check_horizontal_scroll,
)

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
