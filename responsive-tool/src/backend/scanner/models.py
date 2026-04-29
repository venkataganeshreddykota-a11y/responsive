from django.db import models
from users.models import User


class ScanURL(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="scan_urls", null=True, blank=True)
    url = models.URLField(max_length=2048)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        user_label = self.user.email if self.user else "anonymous"
        return f"{user_label} — {self.url}"


class ScanReport(models.Model):
    STATUS_CHOICES = [
        ("pending",   "Pending"),
        ("running",   "Running"),
        ("completed", "Completed"),
        ("failed",    "Failed"),
    ]

    scan_url       = models.ForeignKey(ScanURL, on_delete=models.CASCADE, related_name="reports")
    status         = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending")
    score          = models.FloatField(null=True, blank=True)
    issues         = models.JSONField(default=list)
    suggestions    = models.JSONField(default=list)
    screenshots    = models.JSONField(default=dict)
    device_results = models.JSONField(default=list)
    raw_result     = models.JSONField(default=dict)
    created_at     = models.DateTimeField(auto_now_add=True)
    updated_at     = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-id"]

    def __str__(self):
        return f"Report #{self.pk} [{self.status}] — {self.scan_url.url}"
