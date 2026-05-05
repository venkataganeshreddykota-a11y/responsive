from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    ScanURLViewSet, ScanReportViewSet,
    trigger_scan, scan_status, iframe_proxy,
    gdrive_auth_start, gdrive_auth_callback,
    gdrive_upload, gdrive_status, gdrive_disconnect,
)

router = DefaultRouter()
router.register("urls",    ScanURLViewSet,    basename="scan-url")
router.register("reports", ScanReportViewSet, basename="scan-report")

urlpatterns = [
    path("", include(router.urls)),
    path("scan/",                        trigger_scan,        name="trigger-scan"),
    path("scan/<int:report_id>/status/", scan_status,         name="scan-status"),
    path("proxy/",                       iframe_proxy,        name="proxy"),
    # Google Drive OAuth
    path("gdrive/auth/",                 gdrive_auth_start,   name="gdrive-auth"),
    path("gdrive/callback/",             gdrive_auth_callback, name="gdrive-callback"),
    path("gdrive/upload/",               gdrive_upload,       name="gdrive-upload"),
    path("gdrive/status/",               gdrive_status,       name="gdrive-status"),
    path("gdrive/disconnect/",           gdrive_disconnect,   name="gdrive-disconnect"),
]
