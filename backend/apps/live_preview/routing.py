from django.urls import re_path

from apps.live_preview.consumers import LivePreviewConsumer

websocket_urlpatterns = [
    re_path(r"^rt-ws/scanner/live-preview/$", LivePreviewConsumer.as_asgi()),
]
