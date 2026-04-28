import logging
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from .models import ScanURL, ScanReport
from .serializers import ScanURLSerializer, ScanReportSerializer, ScanTriggerSerializer
from . import tasks

logger = logging.getLogger(__name__)


# ── ViewSets (CRUD / list) ────────────────────────────────────────────────────

class ScanURLViewSet(viewsets.ModelViewSet):
    serializer_class = ScanURLSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return (
            ScanURL.objects
            .filter(user=self.request.user)
            .prefetch_related("reports")
        )


class ScanReportViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = ScanReportSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return ScanReport.objects.filter(scan_url__user=self.request.user)


# ── Scan trigger ──────────────────────────────────────────────────────────────

@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def trigger_scan(request):
    """
    POST /api/scanner/scan/
    Body: { "url": "https://example.com" }

    Creates a ScanURL + ScanReport (status=pending), dispatches a background
    thread to run the analysis, and immediately returns the report id so the
    frontend can poll for results.
    """
    serializer = ScanTriggerSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    url = serializer.validated_data["url"]

    # Persist the URL record
    scan_url, _ = ScanURL.objects.get_or_create(
        user=request.user,
        url=url,
    )

    # Create a fresh report for this scan run
    report = ScanReport.objects.create(scan_url=scan_url, status="pending")

    # Fire background thread
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


# ── Status / result polling ───────────────────────────────────────────────────

@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def scan_status(request, report_id):
    """
    GET /api/scanner/scan/<report_id>/status/

    Returns the current state of a scan report.
    When status == "completed" the full result (score, issues, suggestions) is included.
    """
    try:
        report = ScanReport.objects.select_related("scan_url").get(
            pk=report_id,
            scan_url__user=request.user,
        )
    except ScanReport.DoesNotExist:
        return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

    return Response(ScanReportSerializer(report).data)
