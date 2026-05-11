import logging
import os

logger = logging.getLogger(__name__)

CHROME_CANDIDATES = [
    os.environ.get("PLAYWRIGHT_CHROME_EXECUTABLE", ""),
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
]

DEFAULT_ARGS = [
    "--disable-dev-shm-usage",
    "--no-sandbox",
]


def launch_chromium(playwright, *, headless=True, args=None):
    launch_args = list(DEFAULT_ARGS)
    launch_args.extend(args or [])
    try:
        return playwright.chromium.launch(headless=headless, args=launch_args)
    except Exception as first_error:
        last_error = first_error
        logger.warning("Bundled Playwright Chromium failed; trying installed Chrome/Edge: %s", first_error)

    for executable_path in [path for path in CHROME_CANDIDATES if path]:
        if not os.path.exists(executable_path):
            continue
        try:
            return playwright.chromium.launch(
                headless=headless,
                executable_path=executable_path,
                args=launch_args,
            )
        except Exception as exc:
            last_error = exc
            logger.warning("Installed browser launch failed for %s: %s", executable_path, exc)

    raise last_error
