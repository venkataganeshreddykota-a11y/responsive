import re


FORBIDDEN_CSS_PATTERNS = [
    r"<\s*script",
    r"javascript\s*:",
    r"expression\s*\(",
    r"@import",
]

FORBIDDEN_JS_PATTERNS = [
    r"<\s*/?\s*script",
    r"\bimport\s*\(",
    r"\bimport\s+",
    r"\beval\s*\(",
    r"\bFunction\s*\(",
    r"\bfetch\s*\(",
    r"\bXMLHttpRequest\b",
    r"\blocation\s*=",
    r"\blocalStorage\b",
    r"\bsessionStorage\b",
]

FORBIDDEN_HTML_PATTERNS = [
    r"<\s*script[^>]*>.*?<\s*/\s*script\s*>",
    r"<\s*/?\s*script[^>]*>",
    r"\son\w+\s*=\s*(['\"]).*?\1",
    r"\sstyle\s*=\s*(['\"])[^'\"]*(?:position\s*:|transform\s*:|left\s*:|right\s*:|top\s*:|bottom\s*:)[^'\"]*\1",
]

BROAD_LAYOUT_SELECTOR_PATTERNS = [
    r"^\*$",
    r"^html\s*,\s*body$",
    r"^body\s+\*$",
]

SENSITIVE_INTERACTIVE_SELECTOR_PATTERNS = [
    r"\b(?:button|btn|cta|call-to-action|start|submit|primary-action)\b",
    r"\[role=['\"]?button['\"]?\]",
    r"\[href\]",
]

STRUCTURAL_PROPERTIES = {
    "align-content",
    "align-items",
    "bottom",
    "display",
    "flex",
    "flex-basis",
    "flex-direction",
    "flex-flow",
    "flex-wrap",
    "float",
    "grid",
    "grid-area",
    "grid-auto-columns",
    "grid-auto-flow",
    "grid-auto-rows",
    "grid-template",
    "grid-template-areas",
    "grid-template-columns",
    "grid-template-rows",
    "height",
    "inset",
    "justify-content",
    "left",
    "margin",
    "margin-bottom",
    "margin-left",
    "margin-right",
    "margin-top",
    "max-height",
    "min-height",
    "min-width",
    "order",
    "padding",
    "padding-bottom",
    "padding-left",
    "padding-right",
    "padding-top",
    "place-content",
    "place-items",
    "position",
    "right",
    "top",
    "transform",
    "translate",
    "visibility",
    "width",
}

GLOBAL_ELEMENT_SELECTORS = {
    "a",
    "article",
    "aside",
    "button",
    "div",
    "footer",
    "form",
    "header",
    "li",
    "main",
    "nav",
    "p",
    "section",
    "span",
    "ul",
}

SAFE_GLOBAL_PROPERTIES = {
    "box-sizing",
    "max-width",
    "overflow-wrap",
    "word-break",
}


def _split_selectors(selector_text):
    selectors = []
    current = []
    depth = 0
    quote = ""
    for char in selector_text:
        if quote:
            current.append(char)
            if char == quote:
                quote = ""
            continue
        if char in ("'", '"'):
            quote = char
            current.append(char)
            continue
        if char in "([":
            depth += 1
        elif char in ")]" and depth:
            depth -= 1
        if char == "," and depth == 0:
            selectors.append("".join(current).strip())
            current = []
        else:
            current.append(char)
    if current:
        selectors.append("".join(current).strip())
    return selectors


def _is_broad_selector(selector):
    compact = re.sub(r"\s+", " ", selector.strip().lower())
    if not compact:
        return True
    if compact in GLOBAL_ELEMENT_SELECTORS:
        return True
    return any(re.search(pattern, compact, flags=re.IGNORECASE) for pattern in BROAD_LAYOUT_SELECTOR_PATTERNS)


def _is_sensitive_interactive_selector(selector):
    compact = re.sub(r"\s+", " ", selector.strip().lower())
    return any(re.search(pattern, compact, flags=re.IGNORECASE) for pattern in SENSITIVE_INTERACTIVE_SELECTOR_PATTERNS)


def _is_specific_selector(selector):
    compact = re.sub(r"\s+", " ", selector.strip().lower())
    if not compact or _is_broad_selector(compact):
        return False
    has_target = bool(re.search(r"[.#][a-z0-9_-]+|\[[a-z0-9_-]+(?:[*^$|~]?=|])", compact, flags=re.IGNORECASE))
    simple_parts = re.split(r"\s+|>|\+|~", compact)
    return has_target and len([part for part in simple_parts if part]) <= 4


def _is_structural_declaration(declaration):
    if ":" not in declaration:
        return False
    prop, value = declaration.split(":", 1)
    prop = prop.strip().lower()
    value = value.strip().lower()
    if prop in STRUCTURAL_PROPERTIES:
        return True
    return False


def _is_forbidden_responsive_declaration(declaration):
    if ":" not in declaration:
        return False
    prop, value = declaration.split(":", 1)
    prop = prop.strip().lower()
    value = value.strip().lower()
    if prop in {"overflow", "overflow-x", "overflow-y"} and re.search(r"\b(hidden|clip)\b", value):
        return True
    if prop == "clip-path" and value and value != "none":
        return True
    if prop in {"transform", "scale", "translate"} and re.search(r"\b(scale|translate|translatex|translate3d)\s*\(", value):
        return True
    return False


def _filter_declarations(block, selectors, warnings):
    declarations = [part.strip() for part in block.split(";") if part.strip()]
    broad = any(_is_broad_selector(selector) for selector in selectors)
    sensitive_interactive = any(_is_sensitive_interactive_selector(selector) for selector in selectors)
    specific = all(_is_specific_selector(selector) for selector in selectors)
    kept = []
    removed = 0
    for declaration in declarations:
        prop = declaration.split(":", 1)[0].strip().lower() if ":" in declaration else ""
        if _is_forbidden_responsive_declaration(declaration):
            removed += 1
            continue
        if broad and prop and prop not in SAFE_GLOBAL_PROPERTIES:
            removed += 1
            continue
        if broad and _is_structural_declaration(declaration):
            removed += 1
            continue
        if sensitive_interactive and not specific and _is_structural_declaration(declaration):
            removed += 1
            continue
        kept.append(declaration)
    if removed:
        selector_type = "interactive" if sensitive_interactive and not broad else "broad layout"
        warnings.append(f"Removed {removed} {selector_type} declaration(s) from '{', '.join(selectors[:2])}'.")
    return kept


def _filter_top_level_rules(css):
    warnings = []

    def replace_rule(match):
        selector_text = match.group("selector").strip()
        block = match.group("block").strip()
        if selector_text.startswith("@"):
            return match.group(0)
        selectors = _split_selectors(selector_text)
        declarations = _filter_declarations(block, selectors, warnings)
        if not declarations:
            warnings.append(f"Removed empty unsafe rule for '{selector_text[:80]}'.")
            return ""
        return f"{selector_text} {{\n  " + ";\n  ".join(declarations) + ";\n}"

    filtered = re.sub(
        r"(?P<selector>[^@{}][^{}]*)\{(?P<block>[^{}]*)\}",
        replace_rule,
        css,
        flags=re.DOTALL,
    )
    return filtered, warnings


def sanitize_css(css_text):
    css = _normalize_patch_text(css_text)
    for pattern in FORBIDDEN_CSS_PATTERNS:
        css = re.sub(pattern, "/* blocked */", css, flags=re.IGNORECASE)
    css, warnings = _filter_top_level_rules(css)
    return css.strip(), warnings


def sanitize_html(html_text):
    html = _normalize_patch_text(html_text)
    for pattern in FORBIDDEN_HTML_PATTERNS:
        html = re.sub(pattern, "", html, flags=re.IGNORECASE | re.DOTALL)
    return html


def sanitize_js(js_text):
    js = _normalize_patch_text(js_text)
    warnings = []
    if len(js) > 5000 or re.search(r"@license|react(?:-dom|-jsx-runtime)?\.production|bootstrap v|google tag|gtag\(", js, flags=re.IGNORECASE):
        return "", ["Removed generated JavaScript because it looked like copied source/library code instead of a small fix patch."]
    for pattern in FORBIDDEN_JS_PATTERNS:
        if re.search(pattern, js, flags=re.IGNORECASE):
            return "", ["Removed unsafe JavaScript from generated fix."]
    return js, warnings


def _normalize_patch_text(value):
    text = str(value or "").strip()
    if not text:
        return ""
    text = text.encode("utf-8", "ignore").decode("utf-8")
    if "\\n" in text and "\n" not in text:
        text = text.replace("\\r\\n", "\n").replace("\\n", "\n").replace("\\t", "  ")
    return text.strip()


def normalize_ai_result(data):
    fixed_css, validation_warnings = sanitize_css(data.get("fixed_css") or data.get("css") or "")
    fixed_html = sanitize_html(data.get("fixed_html") or data.get("html") or data.get("optional_html") or "")
    fixed_js, js_warnings = sanitize_js(data.get("fixed_js") or data.get("generated_js") or data.get("js") or "")
    confidence = data.get("confidence", 0.72)
    try:
        confidence = max(0, min(1, float(confidence)))
    except (TypeError, ValueError):
        confidence = 0.72

    return {
        "fixed_css": fixed_css,
        "fixed_html": fixed_html,
        "fixed_js": fixed_js,
        "optional_html": fixed_html,
        "confidence": confidence,
        "explanation": (data.get("explanation") or "Generated a responsive HTML/CSS/JS patch for the selected breakpoint.").strip(),
        "device_fixes": data.get("device_fixes") or [],
        "validation_warnings": validation_warnings + js_warnings,
    }
