import logging
import threading
from django.db import connections

logger = logging.getLogger(__name__)

_DEDUCTIONS = {"critical": 20, "warning": 8, "info": 2}


def _compute_score(issues: list) -> float:
    score = 100.0
    for issue in issues:
        score -= _DEDUCTIONS.get(issue.get("severity", "info"), 2)
    return max(0.0, score)


def _dedupe_issues(issues: list) -> list:
    seen = set()
    out = []
    for issue in issues:
        key = (issue.get("title", ""), issue.get("device", ""))
        if key not in seen:
            seen.add(key)
            out.append(issue)
    return out


def _dedupe_suggestions(suggestions: list) -> list:
    seen = set()
    out = []
    for s in suggestions:
        if s.get("title") not in seen:
            seen.add(s["title"])
            out.append(s)
    return out


def _run(report_id: int, url: str, devices: list = None):
    from .models import ScanReport
    from .analyzer import analyze
    from .playwright_engine import run_playwright_scan
    from .result_processor import process as process_results

    try:
        ScanReport.objects.filter(pk=report_id).update(status="running")

        logger.info("[%s] Starting static analysis for %s", report_id, url)
        static = analyze(url)

        logger.info("[%s] Starting Playwright scan for %s with devices: %s", report_id, url, devices)
        pw_result = run_playwright_scan(url, devices)

        merged_issues      = _dedupe_issues(static["issues"] + pw_result["issues"])
        merged_suggestions = _dedupe_suggestions(static["suggestions"] + pw_result["suggestions"])
        score = _compute_score(merged_issues)

        processed = process_results(
            score=score,
            issues=merged_issues,
            suggestions=merged_suggestions,
            device_results=pw_result["device_results"],
        )

        raw = {**static["raw_result"], "playwright_ok": pw_result["playwright_ok"]}

        ScanReport.objects.filter(pk=report_id).update(
            status="completed",
            score=score,
            issues=merged_issues,
            suggestions=merged_suggestions,
            screenshots=pw_result["screenshots"],
            device_results=pw_result["device_results"],
            raw_result={**raw, "processed": processed, "requested_devices": devices},
        )
        logger.info("[%s] Scan completed — verdict=%s score=%.1f issues=%d",
                    report_id, processed["verdict"], score, len(merged_issues))

    except Exception as exc:
        logger.error("[%s] Scan failed: %s", report_id, exc, exc_info=True)
        ScanReport.objects.filter(pk=report_id).update(
            status="failed",
            raw_result={"error": str(exc)},
        )
    finally:
        try:
            connections.close_all()
        except Exception:
            pass


def dispatch(report_id: int, url: str, devices: list = None):
    t = threading.Thread(target=_run, args=(report_id, url, devices), daemon=True)
    t.start()
    logger.info("Dispatched scan thread for report %s → %s (devices: %s)", report_id, url, devices)
