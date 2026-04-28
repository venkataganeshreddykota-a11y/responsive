"""
Result processor — takes raw merged scan data and produces a
clean, frontend-ready payload with:

  - status_verdict : "good" | "needs_fix" | "broken"
  - status_label   : human-readable string
  - status_detail  : one-line explanation
  - score          : 0-100 float
  - issue_groups   : issues grouped by category with highlight metadata
  - resolution_advice : ordered list of recommended viewport fixes
  - device_status  : per-device "good" | "needs_fix" | "broken"
"""

from __future__ import annotations


# ── verdict thresholds ────────────────────────────────────────────────────────

def compute_verdict(score: float, issues: list) -> dict:
    critical_count = sum(1 for i in issues if i.get("severity") == "critical")
    warning_count  = sum(1 for i in issues if i.get("severity") == "warning")

    if score >= 80 and critical_count == 0:
        verdict = "good"
        label   = "Good"
        detail  = "The page is well-optimised across all tested viewports."
    elif critical_count >= 3 or score < 40:
        verdict = "broken"
        label   = "Broken"
        detail  = (
            f"{critical_count} critical issue(s) detected. "
            "The layout is likely unusable on one or more device sizes."
        )
    else:
        verdict = "needs_fix"
        label   = "Needs Fix"
        detail  = (
            f"{critical_count} critical and {warning_count} warning issue(s) found. "
            "Some viewports have layout problems that should be addressed."
        )

    return {"verdict": verdict, "label": label, "detail": detail}


# ── issue grouping ────────────────────────────────────────────────────────────

_CATEGORY_MAP = {
    "overflow":      ["overflow", "horizontal scroll", "wider than"],
    "images":        ["image", "img", "srcset", "fluid"],
    "touch":         ["touch", "target", "tap", "button"],
    "typography":    ["font", "text", "typography", "readable"],
    "viewport":      ["viewport", "meta", "zoom", "scale"],
    "layout":        ["layout", "flexbox", "grid", "float", "fixed-width", "fixed width",
                      "breakpoint", "media quer", "overlap", "invisible", "zero-height"],
    "performance":   ["performance", "load", "timeout"],
}

_CATEGORY_LABELS = {
    "overflow":    "Overflow & Scroll",
    "images":      "Images",
    "touch":       "Touch Targets",
    "typography":  "Typography",
    "viewport":    "Viewport Config",
    "layout":      "Layout & Structure",
    "performance": "Performance",
    "other":       "Other",
}

_HIGHLIGHT_KEYWORDS = [
    "overflow", "fixed width", "fixed-width", "missing", "broken",
    "no css media", "no media", "small font", "small touch", "overlap",
    "zero-height", "invisible", "timeout",
]


def _categorise(issue: dict) -> str:
    text = (issue.get("title", "") + " " + issue.get("description", "")).lower()
    for cat, keywords in _CATEGORY_MAP.items():
        if any(kw in text for kw in keywords):
            return cat
    return "other"


def _should_highlight(issue: dict) -> bool:
    text = (issue.get("title", "") + " " + issue.get("description", "")).lower()
    return issue.get("severity") == "critical" or any(kw in text for kw in _HIGHLIGHT_KEYWORDS)


def group_issues(issues: list) -> list:
    """
    Returns a list of category groups, each with:
      { category, label, count, severity_max, issues: [...+highlighted flag] }
    Sorted: critical groups first, then by count desc.
    """
    groups: dict[str, list] = {}
    for issue in issues:
        cat = _categorise(issue)
        groups.setdefault(cat, []).append({
            **issue,
            "highlighted": _should_highlight(issue),
        })

    _sev_order = {"critical": 0, "warning": 1, "info": 2}

    result = []
    for cat, cat_issues in groups.items():
        max_sev = min(cat_issues, key=lambda i: _sev_order.get(i.get("severity", "info"), 2))
        result.append({
            "category":     cat,
            "label":        _CATEGORY_LABELS.get(cat, cat.title()),
            "count":        len(cat_issues),
            "severity_max": max_sev.get("severity", "info"),
            "issues":       cat_issues,
        })

    result.sort(key=lambda g: (_sev_order.get(g["severity_max"], 2), -g["count"]))
    return result


# ── per-device status ─────────────────────────────────────────────────────────

def device_status(device_results: list) -> list:
    out = []
    for dr in device_results:
        issues = dr.get("issues", [])
        crits  = sum(1 for i in issues if i.get("severity") == "critical")
        warns  = sum(1 for i in issues if i.get("severity") == "warning")

        if crits >= 2 or (crits >= 1 and warns >= 2):
            status = "broken"
        elif crits >= 1 or warns >= 2:
            status = "needs_fix"
        else:
            status = "good"

        out.append({
            "device":      dr["device"],
            "width":       dr["width"],
            "status":      status,
            "issue_count": len(issues),
            "probes":      dr.get("probes", {}),
        })
    return out


# ── resolution advice ─────────────────────────────────────────────────────────

_BREAKPOINT_ADVICE = {
    "mobile": {
        "viewport": "375px (iPhone SE) — 480px",
        "css":      "@media (max-width: 480px) { … }",
        "tip":      "Stack columns, increase font sizes, enlarge touch targets to ≥44px.",
    },
    "tablet": {
        "viewport": "768px (iPad) — 1024px",
        "css":      "@media (min-width: 481px) and (max-width: 1024px) { … }",
        "tip":      "Use 2-column grids, adjust navigation to a collapsible menu.",
    },
    "laptop": {
        "viewport": "1280px — 1440px",
        "css":      "@media (min-width: 1025px) and (max-width: 1440px) { … }",
        "tip":      "Constrain max-width to 1200px with auto margins for readability.",
    },
    "desktop": {
        "viewport": "1440px+",
        "css":      "@media (min-width: 1441px) { … }",
        "tip":      "Scale up whitespace and typography; avoid content stretching too wide.",
    },
}


def resolution_advice(device_results: list, suggestions: list) -> list:
    """
    Build an ordered list of resolution recommendations.
    Broken/needs_fix devices get a specific breakpoint fix entry first,
    followed by the general suggestions from the analyzer/playwright engine.
    """
    advice = []
    statuses = device_status(device_results)

    for ds in statuses:
        if ds["status"] in ("broken", "needs_fix"):
            bp = _BREAKPOINT_ADVICE.get(ds["device"], {})
            advice.append({
                "priority":  "high" if ds["status"] == "broken" else "medium",
                "device":    ds["device"],
                "viewport":  bp.get("viewport", f"{ds['width']}px"),
                "css_hint":  bp.get("css", ""),
                "tip":       bp.get("tip", ""),
                "issue_count": ds["issue_count"],
            })

    # append general suggestions (deduplicated by title)
    seen_titles = {a.get("viewport", "") for a in advice}  # seed with viewport strings already used
    for s in suggestions:
        if s.get("title") not in seen_titles:
            seen_titles.add(s["title"])
            advice.append({
                "priority": "low",
                "category": s.get("category", ""),
                "title":    s["title"],
                "detail":   s.get("detail", ""),
            })

    return advice


# ── main entry ────────────────────────────────────────────────────────────────

def process(score: float, issues: list, suggestions: list, device_results: list) -> dict:
    """
    Returns the complete processed result dict ready for the API response.
    """
    verdict_data   = compute_verdict(score, issues)
    grouped_issues = group_issues(issues)
    dev_statuses   = device_status(device_results)
    res_advice     = resolution_advice(device_results, suggestions)

    return {
        "verdict":         verdict_data["verdict"],
        "verdict_label":   verdict_data["label"],
        "verdict_detail":  verdict_data["detail"],
        "score":           round(score, 1),
        "issue_groups":    grouped_issues,
        "device_status":   dev_statuses,
        "resolution_advice": res_advice,
    }
