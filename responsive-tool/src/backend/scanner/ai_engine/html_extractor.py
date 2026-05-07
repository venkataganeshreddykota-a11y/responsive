import re
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup


HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0 Safari/537.36"
    ),
    "Accept": "text/css,*/*;q=0.1",
    "Accept-Language": "en-US,en;q=0.9",
}

CSS_LIMIT = 220000


def _normalize_css(css_text):
    css = re.sub(r"</?span[^>]*>", "", css_text or "", flags=re.IGNORECASE)
    css = re.sub(r"&lt;/?span[^&]*&gt;", "", css, flags=re.IGNORECASE)
    css = re.sub(r"/\*# sourceMappingURL=.*?\*/", "", css, flags=re.IGNORECASE | re.DOTALL)
    css = re.sub(r"\n{4,}", "\n\n", css)
    return css.strip()


def _format_css(css_text):
    css = _normalize_css(css_text)
    if not css:
        return ""

    strings = []

    def mask_string(match):
        strings.append(match.group(0))
        return f"__CSS_STRING_{len(strings) - 1}__"

    css = re.sub(r"""(["'])(?:\\.|(?!\1).)*\1""", mask_string, css, flags=re.DOTALL)
    css = re.sub(r"\s+", " ", css)
    css = re.sub(r"\s*/\*\s*Source:", "\n\n/* Source:", css)
    css = re.sub(r"\*/\s*", " */\n", css)
    css = re.sub(r"\s*{\s*", " {\n  ", css)
    css = re.sub(r";\s*", ";\n  ", css)
    css = re.sub(r"\s*}\s*", "\n}\n", css)
    css = re.sub(r"\s*,\s*", ", ", css)
    css = re.sub(r"\n\s*@", "\n@", css)
    css = re.sub(r"[ \t]+\n", "\n", css)
    css = re.sub(r"\n{3,}", "\n\n", css)
    css = "\n".join(line.rstrip() for line in css.splitlines()).strip()

    def restore_string(match):
        index = int(match.group(1))
        return strings[index] if index < len(strings) else match.group(0)

    return re.sub(r"__CSS_STRING_(\d+)__", restore_string, css)


def _css_priority(source_url, page_origin):
    url = (source_url or "").lower()
    if not source_url:
        return 15
    if "fonts.googleapis.com" in url or "fonts.gstatic.com" in url:
        return 80
    if "fontawesome" in url or "font-awesome" in url:
        return 75
    if "bootstrap" in url or "tailwind" in url:
        return 45
    if source_url.startswith(page_origin):
        return 10
    if any(token in url for token in ("app", "main", "index", "style", "bundle", "chunk", "assets")):
        return 20
    return 35


def _append_chunk(chunks, label, css_text, source_url="", page_origin=""):
    css = _format_css(css_text)
    if not css:
        return
    chunks.append({
        "priority": _css_priority(source_url, page_origin),
        "source": label,
        "url": source_url,
        "css": css,
    })


def extract_from_url(url):
    page_headers = {**HEADERS, "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"}
    response = requests.get(url, headers=page_headers, timeout=18, allow_redirects=True)
    response.raise_for_status()
    soup = BeautifulSoup(response.text, "html.parser")
    base_url = response.url
    parsed = urlparse(base_url)
    origin = f"{parsed.scheme}://{parsed.netloc}"
    css_chunks = []

    for index, tag in enumerate(soup.find_all("style"), start=1):
        _append_chunk(css_chunks, f"inline style #{index}", tag.get_text("\n", strip=False), page_origin=origin)

    css_links = []
    for link in soup.find_all("link"):
        rel = " ".join(link.get("rel") or []).lower()
        href = link.get("href")
        as_attr = (link.get("as") or "").lower()
        if not href:
            continue
        if "stylesheet" not in rel and as_attr != "style" and not href.lower().split("?", 1)[0].endswith(".css"):
            continue
        if href in css_links:
            continue
        css_links.append(href)

    for href in css_links[:24]:
        if href.startswith("//"):
            css_url = f"{parsed.scheme}:{href}"
        elif href.startswith("/"):
            css_url = origin + href
        else:
            css_url = urljoin(base_url, href)
        try:
            css_response = requests.get(css_url, headers={**HEADERS, "Referer": base_url}, timeout=12)
            if css_response.ok:
                _append_chunk(css_chunks, f"external stylesheet: {css_url}", css_response.text, css_url, origin)
        except requests.RequestException:
            continue

    ordered_chunks = sorted(css_chunks, key=lambda item: item["priority"])
    css_parts = []
    total = 0
    for item in ordered_chunks:
        header = f"/* Source: {item['source']} */"
        part = f"{header}\n{item['css']}"
        if total + len(part) > CSS_LIMIT:
            remaining = CSS_LIMIT - total
            if remaining > 1200:
                css_parts.append(part[:remaining])
            break
        css_parts.append(part)
        total += len(part)

    return {
        "html": str(soup)[:60000],
        "css": "\n\n".join(css_parts),
        "css_sources": [
            {"source": item["source"], "url": item["url"], "size": len(item["css"])}
            for item in ordered_chunks
        ],
        "dom": {
            "title": soup.title.string.strip() if soup.title and soup.title.string else "",
            "links": len(soup.find_all("a")),
            "images": len(soup.find_all("img")),
            "buttons": len(soup.find_all(["button", "input"])),
            "forms": len(soup.find_all("form")),
        },
    }
