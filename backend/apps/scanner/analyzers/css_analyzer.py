"""
CSS-specific static analysis checks.
Extracted from html_analyzer.py for separation of concerns.
"""
import re


def check_media_queries(css_text):
    issues, suggestions = [], []
    if not re.search(r"@media\s*\(", css_text, re.I):
        suggestions.append({"category": "layout", "title": "Add responsive media queries",
            "detail": "If the rendered scan shows layout problems, add breakpoint rules such as @media (max-width: 768px) { ... }."})
    elif not re.search(r"@media[^{]*(?:max-width\s*:\s*(?:480|600|767|768)px|min-width\s*:\s*(?:320|375|414)px)", css_text, re.I):
        suggestions.append({"category": "layout", "title": "Add a mobile breakpoint",
            "detail": "If mobile screenshots show layout problems, add @media (max-width: 768px) { ... } rules."})
    return issues, suggestions


def check_fixed_widths(css_text):
    issues, suggestions = [], []
    large_fixed = [int(v) for v in re.findall(r"width\s*:\s*(\d+)px", css_text) if int(v) > 480]
    if large_fixed:
        suggestions.append({"category": "layout", "title": "Review fixed widths",
            "detail": f"Found {len(large_fixed)} CSS width rule(s) over 480px. If rendered overflow appears, replace fixed widths with max-width, %, or vw units."})
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


def check_flexbox_grid(css_text):
    has_flex  = bool(re.search(r"display\s*:\s*flex", css_text, re.I))
    has_grid  = bool(re.search(r"display\s*:\s*grid", css_text, re.I))
    has_float = bool(re.search(r"float\s*:\s*(left|right)", css_text, re.I))
    suggestions = []
    if has_float and not has_flex and not has_grid:
        suggestions.append({"category": "layout", "title": "Migrate float layouts to Flexbox/Grid",
            "detail": "Float-based layouts are fragile on small screens. CSS Flexbox and Grid are robust alternatives."})
    return [], suggestions
