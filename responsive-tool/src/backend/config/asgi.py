import os
import sys
import asyncio

from channels.routing import ProtocolTypeRouter, URLRouter
from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

django_asgi_app = get_asgi_application()

try:
    import scanner.routing

    websocket_patterns = scanner.routing.websocket_urlpatterns
except Exception:
    websocket_patterns = []

application = ProtocolTypeRouter({
    "http": django_asgi_app,
    "websocket": URLRouter(websocket_patterns),
})
