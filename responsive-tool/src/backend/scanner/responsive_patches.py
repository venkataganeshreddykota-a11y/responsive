from __future__ import annotations

from collections import OrderedDict


MAX_RENDERED_HTML_CHARS = 250_000
MAX_ELEMENTS = 450


EXTRACT_RENDERED_PAGE_JS = """
() => {
  const viewport = {
    width: window.innerWidth,
    height: window.innerHeight,
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight
  };

  function isVisible(el) {
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      style.opacity !== "0"
    );
  }

  function selectorFor(el) {
    if (el.id) return "#" + CSS.escape(el.id);

    const testId = el.getAttribute("data-testid") || el.getAttribute("data-test");
    if (testId) return el.tagName.toLowerCase() + "[data-testid=\\"" + CSS.escape(testId) + "\\"]";

    const parts = [];
    let current = el;
    while (current && current.nodeType === Node.ELEMENT_NODE && parts.length < 4) {
      let part = current.tagName.toLowerCase();
      const stableClasses = Array.from(current.classList || [])
        .filter((cls) => !/^[a-z0-9_-]{8,}$/i.test(cls) || /container|grid|row|col|card|nav|hero|content|button|image|title|text/i.test(cls))
        .slice(0, 2);
      if (stableClasses.length) part += "." + stableClasses.map((cls) => CSS.escape(cls)).join(".");
      parts.unshift(part);
      current = current.parentElement;
    }
    return parts.join(" > ");
  }

  const elements = Array.from(document.querySelectorAll("body *"))
    .filter(isVisible)
    .slice(0, %(max_elements)d)
    .map((el) => {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      const parentRect = el.parentElement ? el.parentElement.getBoundingClientRect() : null;
      const isImage = ["IMG", "VIDEO", "CANVAS", "SVG"].includes(el.tagName);
      return {
        selector: selectorFor(el),
        tag: el.tagName.toLowerCase(),
        text: (el.innerText || el.textContent || "").trim().replace(/\\s+/g, " ").slice(0, 120),
        isClickable: el.matches("a, button, input, select, textarea, [role='button'], [onclick], [tabindex]"),
        rect: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          right: Math.round(rect.right),
          bottom: Math.round(rect.bottom)
        },
        parentRect: parentRect ? {
          width: Math.round(parentRect.width),
          height: Math.round(parentRect.height)
        } : null,
        computed: {
          display: style.display,
          position: style.position,
          width: style.width,
          minWidth: style.minWidth,
          maxWidth: style.maxWidth,
          height: style.height,
          minHeight: style.minHeight,
          fontSize: style.fontSize,
          lineHeight: style.lineHeight,
          overflowX: style.overflowX,
          whiteSpace: style.whiteSpace,
          marginLeft: style.marginLeft,
          marginRight: style.marginRight,
          marginTop: style.marginTop,
          marginBottom: style.marginBottom,
          paddingLeft: style.paddingLeft,
          paddingRight: style.paddingRight,
          paddingTop: style.paddingTop,
          paddingBottom: style.paddingBottom,
          gap: style.gap,
          boxSizing: style.boxSizing,
          objectFit: style.objectFit
        },
        media: isImage ? {
          naturalWidth: el.naturalWidth || null,
          naturalHeight: el.naturalHeight || null
        } : null
      };
    });

  return {
    viewport,
    renderedHtml: document.documentElement.outerHTML.slice(0, %(max_html)d),
    renderedHtmlTruncated: document.documentElement.outerHTML.length > %(max_html)d,
    elements
  };
}
""" % {"max_elements": MAX_ELEMENTS, "max_html": MAX_RENDERED_HTML_CHARS}


def _px(value: str | int | float | None) -> float:
    if value is None:
        return 0
    if isinstance(value, (int, float)):
        return float(value)
    value = str(value).strip()
    if value.endswith("px"):
        value = value[:-2]
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0


def _breakpoint(width: int) -> str:
    if width <= 480:
        return "@media (max-width: 480px)"
    if width <= 768:
        return "@media (max-width: 768px)"
    if width <= 1024:
        return "@media (max-width: 1024px)"
    return "@media (min-width: 1025px)"


def _issue(
    *,
    issue_type: str,
    severity: str,
    title: str,
    description: str,
    device: str,
    selector: str,
    viewport: dict,
    evidence: dict,
    fix: str,
) -> dict:
    return {
        "type": issue_type,
        "severity": severity,
        "title": title,
        "description": description,
        "device": device.capitalize(),
        "source": "playwright",
        "selector": selector,
        "viewport": viewport,
        "evidence": evidence,
        "suggested_fix": fix,
    }


def detect_rendered_issues(device: str, extraction: dict) -> list[dict]:
    viewport = extraction.get("viewport") or {}
    viewport_width = int(viewport.get("width") or 0)
    if not viewport_width:
        return []

    issues: list[dict] = []
    seen = set()

    for el in extraction.get("elements", []):
        selector = el.get("selector") or el.get("tag") or "*"
        rect = el.get("rect") or {}
        computed = el.get("computed") or {}
        parent_rect = el.get("parentRect") or {}
        media = el.get("media") or {}
        width = _px(rect.get("width"))
        height = _px(rect.get("height"))
        right = _px(rect.get("right"))
        font_size = _px(computed.get("fontSize"))
        min_width = _px(computed.get("minWidth"))
        margin_x = _px(computed.get("marginLeft")) + _px(computed.get("marginRight"))
        padding_x = _px(computed.get("paddingLeft")) + _px(computed.get("paddingRight"))
        gap = _px(computed.get("gap"))
        key_prefix = (device, selector)

        if right > viewport_width + 2 or width > viewport_width + 2:
            key = (*key_prefix, "horizontal-overflow")
            if key not in seen:
                seen.add(key)
                issues.append(_issue(
                    issue_type="horizontal-overflow",
                    severity="critical",
                    title=f"Horizontal overflow at {device}",
                    description=(
                        f"`{selector}` extends beyond the {viewport_width}px viewport. "
                        "Generate a responsive width constraint and recheck in Live View."
                    ),
                    device=device,
                    selector=selector,
                    viewport=viewport,
                    evidence={"element_width": round(width), "element_right": round(right), "viewport_width": viewport_width},
                    fix="width: auto; max-width: 100%; min-width: 0; box-sizing: border-box;",
                ))

        if viewport_width <= 768 and (min_width > viewport_width or width > viewport_width * 1.05):
            key = (*key_prefix, "fixed-width-mobile")
            if key not in seen:
                seen.add(key)
                issues.append(_issue(
                    issue_type="fixed-width-mobile",
                    severity="critical",
                    title=f"Fixed width on small screen at {device}",
                    description=(
                        f"`{selector}` renders wider than the small viewport. Replace rigid pixel sizing with fluid bounds."
                    ),
                    device=device,
                    selector=selector,
                    viewport=viewport,
                    evidence={"computed_width": computed.get("width"), "computed_min_width": computed.get("minWidth")},
                    fix="width: 100%; max-width: 100%; min-width: 0;",
                ))

        if viewport_width <= 480 and 0 < font_size < 12 and el.get("text"):
            key = (*key_prefix, "text-too-small")
            if key not in seen:
                seen.add(key)
                issues.append(_issue(
                    issue_type="text-too-small",
                    severity="warning",
                    title=f"Text too small at {device}",
                    description=f"`{selector}` uses {computed.get('fontSize')} text, which is hard to read on mobile.",
                    device=device,
                    selector=selector,
                    viewport=viewport,
                    evidence={"font_size": computed.get("fontSize"), "sample_text": el.get("text")},
                    fix="font-size: max(14px, 1rem); line-height: 1.4;",
                ))

        if el.get("isClickable") and viewport_width <= 768 and (width < 44 or height < 44):
            key = (*key_prefix, "touch-target-too-small")
            if key not in seen:
                seen.add(key)
                issues.append(_issue(
                    issue_type="touch-target-too-small",
                    severity="warning",
                    title=f"Touch target too small at {device}",
                    description=f"`{selector}` is {round(width)}x{round(height)}px. Mobile controls should be at least 44x44px.",
                    device=device,
                    selector=selector,
                    viewport=viewport,
                    evidence={"width": round(width), "height": round(height)},
                    fix="min-width: 44px; min-height: 44px; padding: 12px 16px;",
                ))

        is_media = el.get("tag") in {"img", "video", "canvas", "svg"}
        parent_width = _px(parent_rect.get("width"))
        if is_media and viewport_width <= 768 and (width > viewport_width + 2 or (parent_width and width > parent_width + 2)):
            key = (*key_prefix, "image-not-scaling")
            if key not in seen:
                seen.add(key)
                issues.append(_issue(
                    issue_type="image-not-scaling",
                    severity="warning",
                    title=f"Media does not scale at {device}",
                    description=f"`{selector}` is wider than its container or viewport. Add fluid media rules.",
                    device=device,
                    selector=selector,
                    viewport=viewport,
                    evidence={
                        "rendered_width": round(width),
                        "container_width": round(parent_width),
                        "natural_width": media.get("naturalWidth"),
                    },
                    fix="max-width: 100%; height: auto;",
                ))

        if viewport_width <= 480 and (margin_x > viewport_width * 0.25 or padding_x > viewport_width * 0.25 or gap > 32):
            key = (*key_prefix, "bad-mobile-spacing")
            if key not in seen:
                seen.add(key)
                issues.append(_issue(
                    issue_type="bad-mobile-spacing",
                    severity="info",
                    title=f"Large spacing on small screen at {device}",
                    description=f"`{selector}` reserves a lot of horizontal spacing on a narrow viewport.",
                    device=device,
                    selector=selector,
                    viewport=viewport,
                    evidence={"horizontal_margin": round(margin_x), "horizontal_padding": round(padding_x), "gap": round(gap)},
                    fix="margin-left: 0; margin-right: 0; padding-left: 16px; padding-right: 16px; gap: 16px;",
                ))

    return issues[:30]


def build_css_patch(url: str, issues: list[dict]) -> dict:
    rules: OrderedDict[tuple[str, str], OrderedDict[str, str]] = OrderedDict()

    for issue in issues:
        selector = issue.get("selector")
        viewport = issue.get("viewport") or {}
        width = int(viewport.get("width") or 480)
        if not selector:
            continue
        key = (_breakpoint(width), selector)
        rules.setdefault(key, OrderedDict())

        issue_type = issue.get("type")
        if issue_type in {"horizontal-overflow", "fixed-width-mobile"}:
            rules[key].update({
                "width": "auto !important",
                "max-width": "100% !important",
                "min-width": "0 !important",
                "box-sizing": "border-box",
            })
        elif issue_type == "text-too-small":
            rules[key].update({
                "font-size": "max(14px, 1rem)",
                "line-height": "1.4",
            })
        elif issue_type == "image-not-scaling":
            rules[key].update({
                "max-width": "100% !important",
                "height": "auto !important",
            })
        elif issue_type == "bad-mobile-spacing":
            rules[key].update({
                "margin-left": "0",
                "margin-right": "0",
                "padding-left": "16px",
                "padding-right": "16px",
                "gap": "16px",
            })
        elif issue_type == "touch-target-too-small":
            rules[key].update({
                "min-width": "44px",
                "min-height": "44px",
                "padding": "12px 16px",
            })

    blocks = [
        "/*",
        "  Responsive CSS patch generated from rendered-page analysis.",
        f"  Source URL: {url}",
        "  Workflow: detect issue -> generate patch -> preview fix.",
        "  This patch does not reconstruct the site's original source code.",
        "*/",
        "",
        "img, video, canvas, svg {",
        "  max-width: 100%;",
        "  height: auto;",
        "}",
        "",
    ]

    grouped: OrderedDict[str, list[tuple[str, OrderedDict[str, str]]]] = OrderedDict()
    for (media, selector), declarations in rules.items():
        grouped.setdefault(media, []).append((selector, declarations))

    for media, selector_rules in grouped.items():
        blocks.append(f"{media} {{")
        for selector, declarations in selector_rules:
            blocks.append(f"  {selector} {{")
            for prop, value in declarations.items():
                blocks.append(f"    {prop}: {value};")
            blocks.append("  }")
            blocks.append("")
        if blocks[-1] == "":
            blocks.pop()
        blocks.append("}")
        blocks.append("")

    css = "\n".join(blocks).strip() + "\n"
    return {
        "css": css,
        "issue_count": len(issues),
        "rule_count": len(rules) + 1,
        "limitations": [
            "Rendered HTML is captured after JavaScript execution, not original source files.",
            "Computed CSS cannot reliably reveal the original CSS/SCSS/Tailwind source or component structure.",
            "Generated rules are patch suggestions for preview and export, not guaranteed full-site rewrites.",
        ],
    }
