import re


FORBIDDEN_CSS_PATTERNS = [
    r"<\s*script",
    r"javascript\s*:",
    r"expression\s*\(",
    r"@import",
]


def sanitize_css(css_text):
    css = (css_text or "").strip()
    for pattern in FORBIDDEN_CSS_PATTERNS:
        css = re.sub(pattern, "/* blocked */", css, flags=re.IGNORECASE)
    return css


def normalize_ai_result(data):
    fixed_css = sanitize_css(data.get("fixed_css") or data.get("css") or "")
    confidence = data.get("confidence", 0.72)
    try:
        confidence = max(0, min(1, float(confidence)))
    except (TypeError, ValueError):
        confidence = 0.72

    return {
        "fixed_css": fixed_css,
        "optional_html": (data.get("optional_html") or "").strip(),
        "confidence": confidence,
        "explanation": (data.get("explanation") or "Generated responsive CSS overrides for the selected breakpoint.").strip(),
        "device_fixes": data.get("device_fixes") or [],
    }
