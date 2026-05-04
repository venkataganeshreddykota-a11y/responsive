from django.contrib import admin
from .models import ScanURL, ScanReport


@admin.register(ScanURL)
class ScanURLAdmin(admin.ModelAdmin):
    list_display = ("url", "created_at")


@admin.register(ScanReport)
class ScanReportAdmin(admin.ModelAdmin):
    list_display = ("pk", "scan_url", "status", "score", "created_at")
