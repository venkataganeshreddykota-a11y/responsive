import logging
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from django.db.models import Prefetch

from .models import ScanURL, ScanReport
from .serializers import ScanURLSerializer, ScanReportSerializer, ScanTriggerSerializer
from . import tasks

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
    scan_url, _ = ScanURL.objects.get_or_create(url=url, defaults={"user": None})
    report = ScanReport.objects.create(scan_url=scan_url, status="pending")
    tasks.dispatch(report.pk, url)

    return Response(
        {
            "report_id": report.pk,
            "scan_url_id": scan_url.pk,
            "status": report.status,
            "message": "Scan started. Poll /api/scanner/scan/<report_id>/status/ for results.",
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
