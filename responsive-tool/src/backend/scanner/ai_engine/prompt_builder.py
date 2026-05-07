import json


SYSTEM_PROMPT = """You are an expert responsive web repair engineer.
Return only valid JSON. Generate safe CSS overrides for an iframe preview.
Prefer CSS-only fixes, use targeted media queries, preserve desktop behavior,
and avoid JavaScript, external imports, or destructive global resets."""


def _clip(value, limit):
    text = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)
    return text[:limit]


def build_prompt(payload):
    device = payload.get("device") or {}
    issues = payload.get("issues") or []
    html = _clip(payload.get("html") or "", 18000)
    css = _clip(payload.get("css") or "", 18000)
    dom = _clip(payload.get("dom") or {}, 9000)

    user_prompt = {
        "task": "Generate production-ready responsive CSS overrides for the selected device.",
        "requirements": [
            "Analyze layout overflow, broken layouts, wrapping, image scaling, flex/grid alignment, buttons, and spacing.",
            "Prefer CSS-only changes.",
            "Use media queries scoped to the provided device resolution.",
            "Do not break desktop layout.",
            "Return optional_html only if a CSS-only fix is not enough.",
        ],
        "device": device,
        "responsive_issues": issues,
        "dom_information": dom,
        "html_excerpt": html,
        "css_excerpt": css,
        "response_schema": {
            "fixed_css": "string",
            "optional_html": "string",
            "confidence": "number from 0 to 1",
            "explanation": "short string",
            "device_fixes": ["short strings"],
        },
    }
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": json.dumps(user_prompt, ensure_ascii=False)},
    ]
