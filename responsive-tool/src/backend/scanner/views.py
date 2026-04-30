import logging
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from django.db.models import Prefetch

from .models import ScanURL, ScanReport
from .serializers import ScanURLSerializer, ScanReportSerializer, ScanTriggerSerializer
from . import tasks, drive_service

logger = logging.getLogger(__name__)


class ScanURLViewSet(viewsets.ModelViewSet):
    serializer_class = ScanURLSerializer
    permission_classes = [permissions.AllowAny]

    def get_queryset(self):
        reports_qs = ScanReport.objects.order_by("id")
        return ScanURL.objects.all().prefetch_related(
            Prefetch("reports", queryset=reports_qs)
        )


class ScanReportViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = ScanReportSerializer
    permission_classes = [permissions.AllowAny]

    def get_queryset(self):
        return ScanReport.objects.all()


@api_view(["POST"])
@permission_classes([permissions.AllowAny])
def trigger_scan(request):
    serializer = ScanTriggerSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    url = serializer.validated_data["url"]
    devices = serializer.validated_data.get("devices")
    scan_url, _ = ScanURL.objects.get_or_create(url=url, defaults={"user": None})
    report = ScanReport.objects.create(scan_url=scan_url, status="pending")
    tasks.dispatch(report.pk, url, devices)

    return Response(
        {
            "report_id": report.pk,
            "scan_url_id": scan_url.pk,
            "status": report.status,
            "message": "Scan started. Poll /api/scanner/scan/<report_id>/status/ for results.",
            "devices": devices
        },
        status=status.HTTP_202_ACCEPTED,
    )


@api_view(["GET"])
@permission_classes([permissions.AllowAny])
def scan_status(request, report_id):
    try:
        report = ScanReport.objects.select_related("scan_url").get(pk=report_id)
    except ScanReport.DoesNotExist:
        return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

    return Response(ScanReportSerializer(report).data)


@api_view(["POST"])
@permission_classes([permissions.AllowAny])
def save_to_drive(request, report_id):
    device_key = request.data.get("device")
    if not device_key:
        return Response({"error": "Device key required."}, status=status.HTTP_400_BAD_REQUEST)

    try:
        report = ScanReport.objects.get(pk=report_id)
        if not report.screenshots or device_key not in report.screenshots:
            return Response({"error": "Screenshot not found."}, status=status.HTTP_404_NOT_FOUND)

        b64_data = report.screenshots[device_key]
        filename = f"screenshot_{report_id}_{device_key}.png"
        
        result = drive_service.upload_screenshot(filename, b64_data)
        
        if "error" in result:
            return Response(result, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
            
        return Response(result, status=status.HTTP_200_OK)

    except ScanReport.DoesNotExist:
        return Response({"detail": "Report not found."}, status=status.HTTP_404_NOT_FOUND)
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
