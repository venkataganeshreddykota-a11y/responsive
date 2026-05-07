from .ai_service import call_sarvam, is_sarvam_configured
from .fix_validator import normalize_ai_result
from .html_extractor import extract_from_url
from .prompt_builder import build_prompt


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
 * Sarvam status: {reason}
{issue_summary}
 */
@media (max-width: {max_width}px) {{
  html,
  body {{
    max-width: 100%;
    overflow-x: hidden;
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

  [class*="container"],
  [class*="wrapper"],
  [class*="section"],
  [class*="row"] {{
    max-width: 100%;
    min-width: 0;
    box-sizing: border-box;
  }}

  [class*="row"],
  [class*="grid"],
  [class*="flex"],
  [style*="display:flex"],
  [style*="display: flex"] {{
    min-width: 0;
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

  button,
  [role="button"],
  input,
  select,
  textarea {{
    max-width: 100%;
    min-height: 44px;
  }}
}}"""

    return normalize_ai_result({
        "fixed_css": css,
        "optional_html": "",
        "confidence": 0.46,
        "explanation": (
            "Sarvam did not return usable generated code, so the tool created a safe CSS-only fallback "
            "from the selected device issues. You can apply it to the iframe preview without modifying the original site."
        ),
        "device_fixes": [
            "Constrain horizontal overflow at the selected breakpoint.",
            "Improve image and embedded media scaling.",
            "Keep text and buttons from forcing layout width.",
        ],
    })


def generate_responsive_fix(payload):
    request_payload = dict(payload)
    extracted = {}
    if request_payload.get("url") and (not request_payload.get("html") or not request_payload.get("css")):
        extracted = extract_from_url(request_payload["url"])
        request_payload.setdefault("html", extracted["html"])
        request_payload.setdefault("css", extracted["css"])
        request_payload.setdefault("dom", extracted["dom"])

    if not is_sarvam_configured():
        raise ValueError("SARVAM_API_KEY is not configured. Source code extraction is available, but AI generation is disabled.")

    messages = build_prompt(request_payload)
    try:
        ai_result = call_sarvam(messages)
        result = normalize_ai_result(ai_result)
        if not result.get("fixed_css"):
            result = _fallback_responsive_fix(request_payload, "Sarvam returned no CSS.")
    except ValueError as exc:
        if "SARVAM_API_KEY is not configured" in str(exc):
            raise
        result = _fallback_responsive_fix(request_payload, str(exc))

    device = request_payload.get("device") or {}
    result["original_html"] = request_payload.get("html") or extracted.get("html") or ""
    result["original_css"] = request_payload.get("css") or extracted.get("css") or ""
    result["generated_css"] = result.get("fixed_css", "")
    result["issues"] = request_payload.get("issues") or []
    result["device_name"] = device.get("name") or device.get("label") or ""
    result["resolution"] = f"{device.get('width')}x{device.get('height')}" if device.get("width") and device.get("height") else ""
    return result
