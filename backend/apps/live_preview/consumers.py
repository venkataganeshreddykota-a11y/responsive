import logging

from channels.generic.websocket import AsyncJsonWebsocketConsumer

from apps.live_preview.sessions.browser_session import BrowserSession

logger = logging.getLogger(__name__)


def create_browser_session(websocket, content):
    session_kwargs = {
        "websocket": websocket,
        "url": (content.get("url") or "").strip(),
        "device_key": content.get("deviceKey") or "",
        "label": content.get("deviceName") or "",
        "width": int(content.get("width") or 390),
        "height": int(content.get("height") or 844),
        "stream_scale": float(content.get("streamScale") or 2),
        "max_fps": float(content.get("maxFps") or 14),
        "stream_format": content.get("streamFormat") or "jpeg",
    }

    stream_quality = content.get("streamQuality")
    if stream_quality is not None:
        try:
            return BrowserSession(**session_kwargs, stream_quality=int(stream_quality))
        except TypeError as exc:
            if "stream_quality" not in str(exc):
                raise
            logger.warning("BrowserSession does not accept stream_quality yet; using default stream quality.")

    return BrowserSession(**session_kwargs)


class LivePreviewConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        await self.accept()
        self.session = None

    async def receive_json(self, content, **kwargs):
        event_type = content.get("type")

        try:
            if event_type == "start":
                if self.session:
                    await self.session.close()

                self.session = create_browser_session(self, content)
                await self.session.start()
                await self.send_json({"type": "ready"})

            elif event_type == "tap" and self.session:
                await self.session.tap(content.get("x", 0), content.get("y", 0))

            elif event_type == "click" and self.session:
                await self.session.click(content.get("x", 0), content.get("y", 0))

            elif event_type == "mouse_move" and self.session:
                await self.session.mouse_move(content.get("x", 0), content.get("y", 0))

            elif event_type == "mouse_down" and self.session:
                await self.session.mouse_down(content.get("x", 0), content.get("y", 0))

            elif event_type == "mouse_up" and self.session:
                await self.session.mouse_up(content.get("x", 0), content.get("y", 0))

            elif event_type == "scroll" and self.session:
                await self.session.scroll(content.get("deltaX", 0), content.get("deltaY", 0))

            elif event_type == "key" and self.session:
                await self.session.key(content.get("key") or "")

            elif event_type == "text" and self.session:
                await self.session.text(content.get("value") or "")

            elif event_type == "reload" and self.session:
                await self.session.reload()

            elif event_type == "resize" and self.session:
                await self.session.resize(int(content.get("width") or 390), int(content.get("height") or 844))

            elif event_type == "inspect_code" and self.session:
                data = await self.session.inspect_code()
                await self.send_json({"type": "response", "requestId": content.get("requestId"), "ok": True, "data": data})

            elif event_type == "apply_css" and self.session:
                data = await self.session.apply_css(
                    content.get("css") or "",
                    html=content.get("html") or "",
                    js=content.get("js") or "",
                )
                await self.send_json({"type": "response", "requestId": content.get("requestId"), "ok": True, "data": data})

        except Exception as exc:
            logger.exception("Live preview event failed: %s", event_type)
            if content.get("requestId"):
                await self.send_json({"type": "response", "requestId": content.get("requestId"), "ok": False, "error": str(exc)})
                return
            await self.send_json({"type": "error", "message": str(exc)})

    async def disconnect(self, close_code):
        if self.session:
            await self.session.close()
            self.session = None
