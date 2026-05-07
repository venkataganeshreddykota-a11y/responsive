import asyncio
import base64
import concurrent.futures
import logging
import queue
import threading
import time

from playwright.sync_api import sync_playwright

from .devices import build_context_options

logger = logging.getLogger(__name__)


class BrowserSession:
    def __init__(
        self,
        *,
        websocket,
        url,
        device_key="",
        label="",
        width=390,
        height=844,
        stream_scale=2,
        max_fps=14,
        stream_format="jpeg",
        stream_quality=84,
    ):
        self.websocket = websocket
        self.url = url
        self.device_key = device_key
        self.label = label
        self.width = int(width)
        self.height = int(height)
        self.loop = None
        self.closed = False
        self.commands = queue.Queue()
        self.started = concurrent.futures.Future()
        self.thread = None
        self.command_lock = threading.Lock()
        self.pending_scroll_x = 0
        self.pending_scroll_y = 0
        self.scroll_command_queued = False
        self.device_scale_factor = 1
        self.stream_width = self.width
        self.stream_height = self.height
        self.last_frame_at = 0
        self.requested_stream_scale = max(1, min(float(stream_scale or 1), 2))
        self.min_frame_interval = 1 / max(1, min(float(max_fps or 14), 60))
        self.stream_format = "png" if str(stream_format).lower() == "png" else "jpeg"
        self.jpeg_quality = max(60, min(int(stream_quality or 84), 90)) if self.stream_format == "jpeg" else None

    async def start(self):
        if not self.url.startswith(("http://", "https://")):
            raise ValueError("Only http/https URLs are supported.")

        self.loop = asyncio.get_running_loop()
        self.thread = threading.Thread(target=self._run, name="rt-playwright-preview", daemon=True)
        self.thread.start()
        await asyncio.wrap_future(self.started)

    def _run(self):
        playwright = None
        browser = None
        context = None
        cdp = None

        try:
            playwright = sync_playwright().start()
            browser = playwright.chromium.launch(
                headless=True,
                args=[
                    "--disable-dev-shm-usage",
                    "--no-sandbox",
                    "--enable-features=NetworkService",
                    "--disable-background-timer-throttling",
                    "--disable-renderer-backgrounding",
                ],
            )
            context_options = build_context_options(
                playwright,
                device_key=self.device_key,
                label=self.label,
                width=self.width,
                height=self.height,
            )
            self.device_scale_factor = float(context_options.get("device_scale_factor") or 1)
            stream_scale = max(1, min(self.device_scale_factor, self.requested_stream_scale))
            self.stream_width = int(self.width * stream_scale)
            self.stream_height = int(self.height * stream_scale)

            context = browser.new_context(**context_options)
            page = context.new_page()
            page.goto(self.url, wait_until="domcontentloaded", timeout=45_000)

            cdp = context.new_cdp_session(page)
            cdp.send("Page.enable")
            cdp.on("Page.screencastFrame", lambda event: self._handle_frame(cdp, event))
            screencast_options = {
                "format": self.stream_format,
                "maxWidth": self.stream_width,
                "maxHeight": self.stream_height,
                "everyNthFrame": 1,
            }
            if self.stream_format == "jpeg":
                screencast_options["quality"] = self.jpeg_quality
            cdp.send("Page.startScreencast", screencast_options)

            self.started.set_result(True)

            while not self.closed:
                try:
                    command, payload = self.commands.get(timeout=0.016)
                except queue.Empty:
                    page.wait_for_timeout(16)
                    continue

                if command == "close":
                    break
                if command == "tap":
                    page.touchscreen.tap(int(payload["x"]), int(payload["y"]))
                elif command == "click":
                    page.mouse.click(int(payload["x"]), int(payload["y"]))
                elif command == "mouse_move":
                    if cdp:
                        cdp.send("Input.dispatchMouseEvent", {
                            "type": "mouseMoved",
                            "x": int(payload["x"]),
                            "y": int(payload["y"]),
                            "button": "none",
                            "buttons": 0,
                            "pointerType": "mouse",
                        })
                    else:
                        page.mouse.move(int(payload["x"]), int(payload["y"]))
                elif command == "mouse_down":
                    if cdp:
                        cdp.send("Input.dispatchMouseEvent", {
                            "type": "mousePressed",
                            "x": int(payload["x"]),
                            "y": int(payload["y"]),
                            "button": "left",
                            "buttons": 1,
                            "clickCount": 1,
                            "pointerType": "mouse",
                        })
                    else:
                        page.mouse.down()
                elif command == "mouse_up":
                    if cdp:
                        cdp.send("Input.dispatchMouseEvent", {
                            "type": "mouseReleased",
                            "x": int(payload["x"]),
                            "y": int(payload["y"]),
                            "button": "left",
                            "buttons": 0,
                            "clickCount": 1,
                            "pointerType": "mouse",
                        })
                    else:
                        page.mouse.up()
                elif command == "scroll":
                    with self.command_lock:
                        delta_x = self.pending_scroll_x
                        delta_y = self.pending_scroll_y
                        self.pending_scroll_x = 0
                        self.pending_scroll_y = 0
                        self.scroll_command_queued = False
                    if delta_x or delta_y:
                        self.last_frame_at = 0
                        if cdp:
                            cdp.send("Input.dispatchMouseEvent", {
                                "type": "mouseWheel",
                                "x": max(1, min(self.width - 1, self.width // 2)),
                                "y": max(1, min(self.height - 1, self.height // 2)),
                                "deltaX": float(delta_x),
                                "deltaY": float(delta_y),
                                "pointerType": "mouse",
                            })
                        else:
                            page.mouse.wheel(float(delta_x), float(delta_y))
                elif command == "key" and payload.get("key"):
                    page.keyboard.press(payload["key"])
                elif command == "text" and payload.get("value"):
                    page.keyboard.insert_text(payload["value"])
                elif command == "reload":
                    page.reload(wait_until="domcontentloaded", timeout=45_000)
                elif command == "resize":
                    self.width = int(payload["width"])
                    self.height = int(payload["height"])
                    page.set_viewport_size({"width": self.width, "height": self.height})

        except Exception as exc:
            if not self.started.done():
                self.started.set_exception(exc)
            else:
                self._send_threadsafe({"type": "error", "message": str(exc)})
            logger.exception("Playwright live preview worker failed")
        finally:
            self.closed = True
            if cdp:
                try:
                    cdp.send("Page.stopScreencast")
                except Exception:
                    pass
            if context:
                context.close()
            if browser:
                browser.close()
            if playwright:
                playwright.stop()

    def _handle_frame(self, cdp, event):
        if self.closed:
            return

        now = time.monotonic()
        if now - self.last_frame_at < self.min_frame_interval:
            if event.get("sessionId"):
                cdp.send("Page.screencastFrameAck", {"sessionId": event["sessionId"]})
            return
        self.last_frame_at = now

        frame_data = event.get("data", "")
        if frame_data:
            self._send_bytes_threadsafe(base64.b64decode(frame_data))
        if event.get("sessionId"):
            cdp.send("Page.screencastFrameAck", {"sessionId": event["sessionId"]})

    def _send_threadsafe(self, message):
        if not self.loop or self.closed:
            return
        asyncio.run_coroutine_threadsafe(self.websocket.send_json(message), self.loop)

    def _send_bytes_threadsafe(self, data):
        if not self.loop or self.closed:
            return
        asyncio.run_coroutine_threadsafe(self.websocket.send(bytes_data=data), self.loop)

    async def tap(self, x, y):
        self.commands.put(("tap", {"x": x, "y": y}))

    async def click(self, x, y):
        self.commands.put(("click", {"x": x, "y": y}))

    async def mouse_move(self, x, y):
        self.commands.put(("mouse_move", {"x": x, "y": y}))

    async def mouse_down(self, x, y):
        self.commands.put(("mouse_down", {"x": x, "y": y}))

    async def mouse_up(self, x, y):
        self.commands.put(("mouse_up", {"x": x, "y": y}))

    async def scroll(self, delta_x, delta_y):
        with self.command_lock:
            self.pending_scroll_x += float(delta_x or 0)
            self.pending_scroll_y += float(delta_y or 0)
            if self.scroll_command_queued:
                return
            self.scroll_command_queued = True
        self.commands.put(("scroll", {}))

    async def key(self, key):
        self.commands.put(("key", {"key": key}))

    async def text(self, value):
        self.commands.put(("text", {"value": value}))

    async def reload(self):
        self.commands.put(("reload", {}))

    async def resize(self, width, height):
        self.commands.put(("resize", {"width": width, "height": height}))

    async def close(self):
        self.closed = True
        self.commands.put(("close", {}))
        if self.thread and self.thread.is_alive():
            await asyncio.to_thread(self.thread.join, 3)
