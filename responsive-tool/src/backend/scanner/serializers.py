from rest_framework import serializers
from .models import ScanURL, ScanReport
from .result_processor import process as process_results
from .result_processor import compute_verdict
from .result_processor import actionable_issues


class ScanReportSerializer(serializers.ModelSerializer):
    score             = serializers.SerializerMethodField()
    issues            = serializers.SerializerMethodField()
    verdict           = serializers.SerializerMethodField()
    verdict_label     = serializers.SerializerMethodField()
    verdict_detail    = serializers.SerializerMethodField()
    issue_groups      = serializers.SerializerMethodField()
    device_status     = serializers.SerializerMethodField()
    resolution_advice = serializers.SerializerMethodField()

    class Meta:
        model = ScanReport
        fields = (
            "id", "status", "score",
            "issues", "suggestions",
            "screenshots", "device_results",
            "verdict", "verdict_label", "verdict_detail",
            "issue_groups", "device_status", "resolution_advice",
            "raw_result", "created_at", "updated_at",
        )
        read_only_fields = fields

    def _processed(self, obj):
        cache_attr = "_processed_cache"
        if hasattr(obj, cache_attr):
            return getattr(obj, cache_attr)
        cached = None
        if obj.status == "completed":
            cached = process_results(
                score=obj.score or 0,
                issues=obj.issues or [],
                suggestions=obj.suggestions or [],
                device_results=obj.device_results or [],
            )
        result = cached or {}
        setattr(obj, cache_attr, result)
        return result

    def get_score(self, obj):
        return self._processed(obj).get("score", obj.score)

    def get_issues(self, obj):
        return self._processed(obj).get(
            "issues",
            actionable_issues(obj.issues or [], obj.device_results or []),
        )

    def get_verdict(self, obj):        return self._processed(obj).get("verdict")
    def get_verdict_label(self, obj):  return self._processed(obj).get("verdict_label")
    def get_verdict_detail(self, obj): return self._processed(obj).get("verdict_detail")
    def get_issue_groups(self, obj):   return self._processed(obj).get("issue_groups", [])
    def get_device_status(self, obj):  return self._processed(obj).get("device_status", [])
    def get_resolution_advice(self, obj): return self._processed(obj).get("resolution_advice", [])


class ScanReportListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for list views — excludes screenshots and raw_result."""
    verdict        = serializers.SerializerMethodField()
    verdict_label  = serializers.SerializerMethodField()

    class Meta:
        model = ScanReport
        fields = ("id", "status", "score", "verdict", "verdict_label", "created_at", "updated_at")
        read_only_fields = fields

    def _processed(self, obj):
        cache_attr = "_processed_cache"
        if hasattr(obj, cache_attr):
            return getattr(obj, cache_attr)
        verdict = compute_verdict(obj.score or 0, obj.issues or [])
        result = {
            "verdict": verdict["verdict"],
            "verdict_label": verdict["label"],
        }
        setattr(obj, cache_attr, result)
        return result

    def get_verdict(self, obj):       return self._processed(obj).get("verdict")
    def get_verdict_label(self, obj): return self._processed(obj).get("verdict_label")


class ScanURLSerializer(serializers.ModelSerializer):
    reports       = ScanReportListSerializer(many=True, read_only=True)
    latest_report = serializers.SerializerMethodField()

    class Meta:
        model = ScanURL
        fields = ("id", "url", "created_at", "reports", "latest_report")
        read_only_fields = ("id", "created_at", "reports", "latest_report")

    def get_latest_report(self, obj):
        reports = list(obj.reports.all())
        report = reports[-1] if reports else None
        return ScanReportListSerializer(report).data if report else None

    def create(self, validated_data):
        return super().create(validated_data)


class ScanTriggerSerializer(serializers.Serializer):
    url = serializers.URLField(max_length=2048)
