MOBILE_CHROME_USER_AGENT = (
    "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36"
)

DESKTOP_CHROME_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)

DEVICE_DESCRIPTOR_ALIASES = {
    "iphone-se": "iPhone SE",
    "iphone-12-pro": "iPhone 12 Pro",
    "iphone-15": "iPhone 14",
    "iphone-plus": "iPhone 8 Plus",
    "iphone-15-pro-max": "iPhone 14 Pro Max",
    "pixel-7": "Pixel 7",
    "pixel-9": "Pixel 7",
    "galaxy-s22": "Galaxy S8",
    "galaxy-s24-ultra": "Galaxy S9+",
    "oneplus-11": "Pixel 7",
    "ipad-mini": "iPad Mini",
    "ipad": "iPad",
    "ipad-air": "iPad (gen 7)",
    "ipad-pro-11": "iPad Pro 11",
    "ipad-pro-13": "iPad Pro 11",
    "surface-duo": "Galaxy Tab S4",
}


def build_context_options(playwright, *, device_key="", label="", width=390, height=844):
    key = (device_key or "").strip().lower()
    descriptor_name = DEVICE_DESCRIPTOR_ALIASES.get(key)

    if not descriptor_name and label:
        normalized_label = label.strip().lower()
        for candidate in playwright.devices:
            if candidate.lower() == normalized_label:
                descriptor_name = candidate
                break

    if descriptor_name and descriptor_name in playwright.devices:
        options = dict(playwright.devices[descriptor_name])
        options["viewport"] = {"width": int(width), "height": int(height)}
        options["screen"] = {"width": int(width), "height": int(height)}
    else:
        is_mobile = int(width) <= 540
        is_tablet = 541 <= int(width) <= 1024 and int(height) >= 700
        touch_device = is_mobile or is_tablet
        options = {
            "viewport": {"width": int(width), "height": int(height)},
            "screen": {"width": int(width), "height": int(height)},
            "is_mobile": touch_device,
            "has_touch": touch_device,
            "device_scale_factor": 3 if is_mobile else 2 if is_tablet else 1,
            "user_agent": MOBILE_CHROME_USER_AGENT if touch_device else DESKTOP_CHROME_USER_AGENT,
        }

    options.update({
        "java_script_enabled": True,
        "ignore_https_errors": True,
        "locale": "en-US",
        "timezone_id": "Asia/Kolkata",
        "color_scheme": "light",
        "reduced_motion": "no-preference",
        "service_workers": "block",
    })
    return options
