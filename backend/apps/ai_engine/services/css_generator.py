from .ai_service import call_openai, is_openai_configured
from ..validators.fix_validator import normalize_ai_result
from .html_extractor import extract_from_url
from ..prompts.prompt_builder import build_prompt


def _device_width(device):
    try:
        return int(device.get("width") or 768)
    except (TypeError, ValueError):
        return 768


def _fallback_responsive_fix(payload, reason):
    device = payload.get("device") or {}
    issues = payload.get("issues") or []
    width = _device_width(device)
    max_width = max(width, 320)
    issue_summary = "\n".join(
        f" * - {issue.get('title') or 'Responsive issue'}: {issue.get('description') or issue.get('detail') or 'Needs review.'}"
        for issue in issues[:8]
    ) or " * - No selected-device issue details were provided."

    css = f"""/* AI fallback responsive CSS overrides
 * Device: {device.get('name') or device.get('label') or 'selected device'} ({device.get('width') or '?'}x{device.get('height') or '?'})
 * OpenAI status: {reason}
{issue_summary}
 * Conservative mode: preserves original component layout with wrapping and fluid sizing.
 */
@media (max-width: {max_width}px) {{
  html,
  body {{
    width: 100%;
    max-width: 100%;
  }}

  *,
  *::before,
  *::after {{
    box-sizing: border-box;
  }}

  [class*="container"],
  [class*="Container"],
  [class*="content"],
  [class*="Content"],
  [class*="card"],
  [class*="Card"] {{
    width: auto;
    max-width: 100%;
    min-width: 0;
  }}

  [class*="row"],
  [class*="Row"],
  [class*="actions"],
  [class*="Actions"],
  [class*="chips"],
  [class*="Chips"],
  [class*="tags"],
  [class*="Tags"] {{
    display: flex;
    flex-wrap: wrap;
    min-width: 0;
    max-width: 100%;
  }}

  img,
  video,
  canvas,
  svg {{
    max-width: 100%;
    height: auto;
  }}

  iframe,
  table,
  pre,
  code {{
    max-width: 100%;
  }}

  p,
  h1,
  h2,
  h3,
  h4,
  h5,
  h6,
  a,
  button,
  li,
  span {{
    overflow-wrap: anywhere;
    word-break: normal;
  }}
}}"""

    return normalize_ai_result({
        "fixed_css": css,
        "fixed_html": "",
        "fixed_js": "",
        "optional_html": "",
        "confidence": 0.46,
        "explanation": (
            "OpenAI did not return usable generated code, so the tool created a safe CSS-only fallback "
            "from the selected device issues using fluid widths and wrapping. HTML and JS are empty because this "
            "fallback does not infer structural or behavior changes without a valid AI response."
        ),
        "device_fixes": [
            "Let wide containers and action groups wrap at the selected breakpoint.",
            "Improve image and embedded media scaling.",
            "Keep text from forcing layout width without moving cards or buttons.",
        ],
    })


def generate_responsive_fix(payload):
    request_payload = dict(payload)
    extracted = {}
    if request_payload.get("url") and (not request_payload.get("html") or not request_payload.get("css")):
        extracted = extract_from_url(request_payload["url"])
        request_payload.setdefault("html", extracted["html"])
        request_payload.setdefault("css", extracted["css"])
        request_payload.setdefault("js", extracted.get("js", ""))
        request_payload.setdefault("dom", extracted["dom"])

    if not is_openai_configured():
        raise ValueError("OPENAI_API_KEY is not configured. Source code extraction is available, but AI generation is disabled.")

    messages = build_prompt(request_payload)
    try:
        ai_result = call_openai(messages)
        result = normalize_ai_result(ai_result)
        if not (result.get("fixed_css") or result.get("fixed_html") or result.get("fixed_js")):
            result = _fallback_responsive_fix(request_payload, "OpenAI returned no usable HTML, CSS, or JavaScript patch.")
    except ValueError as exc:
        if "OPENAI_API_KEY is not configured" in str(exc):
            raise
        result = _fallback_responsive_fix(request_payload, str(exc))

    device = request_payload.get("device") or {}
    result["original_html"] = request_payload.get("html") or extracted.get("html") or ""
    result["original_css"] = request_payload.get("css") or extracted.get("css") or ""
    result["original_js"] = request_payload.get("js") or extracted.get("js") or ""
    result["generated_css"] = result.get("fixed_css", "")
    result["generated_html"] = result.get("fixed_html", "") or result.get("optional_html", "")
    result["generated_js"] = result.get("fixed_js", "")
    result["issues"] = request_payload.get("issues") or []
    result["device_name"] = device.get("name") or device.get("label") or ""
    result["resolution"] = f"{device.get('width')}x{device.get('height')}" if device.get("width") and device.get("height") else ""
    return result
