from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ScanURLViewSet, ScanReportViewSet, trigger_scan, scan_status

router = DefaultRouter()
router.register("urls",    ScanURLViewSet,    basename="scan-url")
router.register("reports", ScanReportViewSet, basename="scan-report")

urlpatterns = [
    path("", include(router.urls)),
    path("scan/",                      trigger_scan, name="trigger-scan"),
    path("scan/<int:report_id>/status/", scan_status,  name="scan-status"),
]
