"""
Accessibility-focused static analysis checks.
Covers touch targets, images, and viewport meta.
"""
import re


def check_viewport_meta(soup):
    issues, suggestions = [], []
    meta = soup.find("meta", attrs={"name": re.compile(r"^viewport$", re.I)})
    if not meta:
        issues.append({"severity": "critical", "title": "Missing viewport meta tag",
            "description": "No <meta name=\"viewport\"> found. Mobile browsers will render at desktop width.",
            "device": "Mobile, Tablet"})
        suggestions.append({"category": "viewport", "title": "Add viewport meta tag",
            "detail": "Add <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"> in <head>."})
    else:
        content = meta.get("content", "")
        if "width=device-width" not in content:
            issues.append({"severity": "warning", "title": "Viewport meta missing width=device-width",
                "description": f"Current content: \"{content}\". Without width=device-width the page won't scale correctly.",
                "device": "Mobile, Tablet"})
            suggestions.append({"category": "viewport", "title": "Fix viewport meta content",
                "detail": "Set content=\"width=device-width, initial-scale=1\" on your viewport meta tag."})
        if "user-scalable=no" in content or "maximum-scale=1" in content:
            suggestions.append({"category": "viewport", "title": "Allow user zoom",
                "detail": "Remove user-scalable=no and maximum-scale=1 from your viewport meta tag."})
    return issues, suggestions


def check_images(soup, css_text):
    issues, suggestions = [], []
    imgs = soup.find_all("img")
    fixed_imgs = [img.get("width") for img in imgs if img.get("width") and str(img.get("width")).isdigit() and int(img.get("width")) > 480]
    if fixed_imgs:
        suggestions.append({"category": "images", "title": "Make images fluid",
            "detail": "Remove fixed width/height attributes and add img { max-width: 100%; height: auto; } to CSS."})
    imgs_without_srcset = [i for i in imgs if not i.get("srcset") and not i.get("sizes")]
    if len(imgs_without_srcset) > 3:
        suggestions.append({"category": "images", "title": "Use srcset for responsive images",
            "detail": f"{len(imgs_without_srcset)} images lack srcset/sizes. Add srcset to serve appropriately sized images."})
    return issues, suggestions


def check_touch_targets(soup, css_text):
    issues, suggestions = [], []
    btn_small = re.findall(r"(?:button|\.btn)[^{]*\{[^}]*height\s*:\s*([1-3]\d)px", css_text, re.I)
    if btn_small:
        suggestions.append({"category": "touch", "title": "Increase touch target size",
            "detail": "For mobile controls, aim for comfortable tap targets around 44x44px."})
    return issues, suggestions


def check_horizontal_scroll(soup):
    issues, suggestions = [], []
    unwrapped = [t for t in soup.find_all("table")
                 if "overflow" not in " ".join(t.parent.get("class", [])) and
                    "scroll" not in " ".join(t.parent.get("class", []))]
    if unwrapped:
        suggestions.append({"category": "layout", "title": "Wrap wide tables",
            "detail": "If tables overflow in rendered screenshots, wrap them in a container with overflow-x: auto."})
    return issues, suggestions
