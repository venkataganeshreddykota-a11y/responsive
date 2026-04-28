"""
Background scan task.

Pipeline:
  1. Static HTML/CSS analysis  (analyzer.py)   — fast, no browser
  2. Playwright browser scan   (playwright_engine.py) — screenshots + JS probes
  3. Merge results, compute final score, persist to DB
"""
import logging
import threading
from django.db import connection, connections

logger = logging.getLogger(__name__)

# Severity weights for scoring
_DEDUCTIONS = {"critical": 20, "warning": 8, "info": 2}


def _compute_score(issues: list) -> float:
    score = 100.0
    for issue in issues:
        score -= _DEDUCTIONS.get(issue.get("severity", "info"), 2)
    return max(0.0, score)


def _dedupe_issues(issues: list) -> list:
    """Remove duplicate issues by (title, device) key."""
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


def _run(report_id: int, url: str):
    from .models import ScanReport
    from .analyzer import analyze
    from .playwright_engine import run_playwright_scan
    from .result_processor import process as process_results

    try:
        ScanReport.objects.filter(pk=report_id).update(status="running")

        # ── Stage 1: static analysis ──────────────────────────────────────────
        logger.info("[%s] Starting static analysis for %s", report_id, url)
        static = analyze(url)

        # ── Stage 2: Playwright browser scan ─────────────────────────────────
        logger.info("[%s] Starting Playwright scan for %s", report_id, url)
        pw_result = run_playwright_scan(url)

        # ── Stage 3: merge ────────────────────────────────────────────────────
        merged_issues = _dedupe_issues(static["issues"] + pw_result["issues"])
        merged_suggestions = _dedupe_suggestions(static["suggestions"] + pw_result["suggestions"])
        score = _compute_score(merged_issues)

        # ── Stage 4: result processing ────────────────────────────────────────
        processed = process_results(
            score=score,
            issues=merged_issues,
            suggestions=merged_suggestions,
            device_results=pw_result["device_results"],
        )

        raw = {
            **static["raw_result"],
            "playwright_ok": pw_result["playwright_ok"],
        }

        ScanReport.objects.filter(pk=report_id).update(
            status="completed",
            score=score,
            issues=merged_issues,
            suggestions=merged_suggestions,
            screenshots=pw_result["screenshots"],
            device_results=pw_result["device_results"],
            raw_result={**raw, "processed": processed},
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
        # Close all DB connections opened by this thread to prevent leaks
        try:
            connections.close_all()
        except Exception:
            pass


def dispatch(report_id: int, url: str):
    t = threading.Thread(target=_run, args=(report_id, url), daemon=True)
    t.start()
    logger.info("Dispatched scan thread for report %s → %s", report_id, url)
