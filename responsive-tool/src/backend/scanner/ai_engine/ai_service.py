import json
import os
import re
from pathlib import Path

import requests
from dotenv import load_dotenv


SARVAM_CHAT_URL = "https://api.sarvam.ai/v1/chat/completions"


def _load_sarvam_env():
    backend_dir = Path(__file__).resolve().parents[2]
    project_dir = backend_dir.parents[1]
    load_dotenv(backend_dir / ".env", override=False)
    load_dotenv(project_dir / ".env", override=False)


def get_sarvam_api_key():
    _load_sarvam_env()
    return (
        (os.environ.get("SARVAM_API_KEY") or "").strip()
        or (os.environ.get("SARVAM_AI_API_KEY") or "").strip()
        or (os.environ.get("SARVAM_API_SUBSCRIPTION_KEY") or "").strip()
        or (os.environ.get("SARVAM_SUBSCRIPTION_KEY") or "").strip()
    )


def is_sarvam_configured():
    return bool(get_sarvam_api_key())


def _extract_json(text):
    content = (text or "").strip()
    if not content:
        raise ValueError("Sarvam returned an empty response. Please check the model name, API key permissions, and account quota.")
    if content.startswith("```"):
        content = re.sub(r"^```(?:json)?\s*", "", content, flags=re.IGNORECASE)
        content = re.sub(r"\s*```$", "", content)
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", content, flags=re.DOTALL)
        if match:
            return json.loads(match.group(0))
        css_match = re.search(r"```(?:css)?\s*(.*?)```", content, flags=re.IGNORECASE | re.DOTALL)
        css = css_match.group(1).strip() if css_match else content
        if css:
            return {
                "fixed_css": css,
                "optional_html": "",
                "confidence": 0.55,
                "explanation": "Sarvam returned CSS/text instead of the requested JSON, so the response was preserved as generated CSS.",
                "device_fixes": [],
            }
        raise ValueError("Sarvam did not return valid JSON or CSS.")


def call_sarvam(messages):
    api_key = get_sarvam_api_key()
    if not api_key:
        raise ValueError("SARVAM_API_KEY is not configured. Add it to the backend .env to enable AI generation.")

    try:
        response = requests.post(
            SARVAM_CHAT_URL,
            headers={
                "Content-Type": "application/json",
                "api-subscription-key": api_key,
                "Authorization": f"Bearer {api_key}",
            },
            json={
                "model": os.environ.get("SARVAM_MODEL", "sarvam-30b"),
                "messages": messages,
                "temperature": 0.15,
                "max_tokens": 2048,
            },
            timeout=45,
        )
        response.raise_for_status()
    except requests.HTTPError as exc:
        body = response.text[:500] if "response" in locals() else ""
        raise ValueError(f"Sarvam API request failed with status {response.status_code}: {body}") from exc
    except requests.RequestException as exc:
        raise ValueError(f"Sarvam API request failed: {exc}") from exc

    try:
        payload = response.json()
    except ValueError as exc:
        body = response.text[:500]
        raise ValueError(f"Sarvam returned a non-JSON API response: {body or 'empty response body'}") from exc

    content = payload.get("choices", [{}])[0].get("message", {}).get("content", "")
    return _extract_json(content)
