from __future__ import annotations


def compute_verdict(score: float, issues: list) -> dict:
    critical_count = sum(1 for i in issues if i.get("severity") == "critical")
    warning_count  = sum(1 for i in issues if i.get("severity") == "warning")

    if score >= 80 and critical_count == 0:
        verdict, label = "good", "Good"
        detail = "The page is well-optimised across all tested viewports."
    elif critical_count >= 3 or score < 40:
        verdict, label = "broken", "Broken"
        detail = (
            f"{critical_count} critical issue(s) detected. "
            "The layout is likely unusable on one or more device sizes."
        )
    else:
        verdict, label = "needs_fix", "Needs Fix"
        detail = (
            f"{critical_count} critical and {warning_count} warning issue(s) found. "
            "Some viewports have layout problems that should be addressed."
        )
    return {"verdict": verdict, "label": label, "detail": detail}


_CATEGORY_MAP = {
    "overflow":    ["overflow", "horizontal scroll", "wider than"],
    "images":      ["image", "img", "srcset", "fluid"],
    "touch":       ["touch", "target", "tap", "button"],
    "typography":  ["font", "text", "typography", "readable"],
    "viewport":    ["viewport", "meta", "zoom", "scale"],
    "layout":      ["layout", "flexbox", "grid", "float", "fixed-width", "fixed width",
                    "breakpoint", "media quer", "overlap", "invisible", "zero-height"],
    "performance": ["performance", "load", "timeout"],
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

_DEDUCTIONS = {"critical": 20, "warning": 8, "info": 2}


def _compute_score(issues: list) -> float:
    score = 100.0
    for issue in issues:
        score -= _DEDUCTIONS.get(issue.get("severity", "info"), 2)
    return max(0.0, score)


def _flatten_device_issues(device_results: list) -> list:
    out = []
    for result in device_results or []:
        out.extend(result.get("issues", []) or [])
    return out


def _is_static_viewport_issue(issue: dict) -> bool:
    if issue.get("source") == "playwright":
        return False
    text = (issue.get("title", "") + " " + issue.get("description", "")).lower()
    return "viewport meta" in text and ("missing" in text or "width=device-width" in text)


def actionable_issues(issues: list, device_results: list) -> list:
    rendered = _flatten_device_issues(device_results)
    if not device_results:
        return issues or []

    static_viewport = [issue for issue in (issues or []) if _is_static_viewport_issue(issue)]
    seen = set()
    out = []
    for issue in static_viewport + rendered:
        key = (issue.get("title", ""), issue.get("device", ""), issue.get("source", ""))
        if key not in seen:
            seen.add(key)
            out.append(issue)
    return out


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
    groups: dict[str, list] = {}
    for issue in issues:
        cat = _categorise(issue)
        groups.setdefault(cat, []).append({**issue, "highlighted": _should_highlight(issue)})

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


def device_status(device_results: list) -> list:
    out = []
    for dr in device_results:
        issues = dr.get("issues", [])
        crits  = sum(1 for i in issues if i.get("severity") == "critical")
        warns  = sum(1 for i in issues if i.get("severity") == "warning")
        if crits >= 2 or (crits >= 1 and warns >= 1):
            status = "broken"
        elif crits >= 1 or warns >= 1:
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


_BREAKPOINT_ADVICE = {
    "mobile":  {"viewport": "375px (iPhone SE) — 480px",  "css": "@media (max-width: 480px) { … }",                              "tip": "Stack columns, increase font sizes, enlarge touch targets to ≥44px."},
    "tablet":  {"viewport": "768px (iPad) — 1024px",       "css": "@media (min-width: 481px) and (max-width: 1024px) { … }",      "tip": "Use 2-column grids, adjust navigation to a collapsible menu."},
    "laptop":  {"viewport": "1280px — 1440px",             "css": "@media (min-width: 1025px) and (max-width: 1440px) { … }",     "tip": "Constrain max-width to 1200px with auto margins for readability."},
    "desktop": {"viewport": "1440px+",                     "css": "@media (min-width: 1441px) { … }",                             "tip": "Scale up whitespace and typography; avoid content stretching too wide."},
}


def resolution_advice(device_results: list, suggestions: list) -> list:
    advice = []
    statuses = device_status(device_results)
    for ds in statuses:
        if ds["issue_count"] == 0:
            continue
        bp = _BREAKPOINT_ADVICE.get(ds["device"], {})
        if ds["status"] == "broken":
            priority = "high"
        elif ds["status"] == "needs_fix":
            priority = "medium"
        else:
            priority = "low"
        advice.append({
            "priority":    priority,
            "device":      ds["device"],
            "viewport":    bp.get("viewport", f"{ds['width']}px"),
            "css_hint":    bp.get("css", ""),
            "tip":         bp.get("tip", ""),
            "issue_count": ds["issue_count"],
        })
    seen_titles = {a.get("viewport", "") for a in advice}
    for s in suggestions:
        if s.get("title") not in seen_titles:
            seen_titles.add(s["title"])
            advice.append({"priority": "low", "category": s.get("category", ""), "title": s["title"], "detail": s.get("detail", "")})
    return advice


def process(score: float, issues: list, suggestions: list, device_results: list) -> dict:
    effective_issues = actionable_issues(issues, device_results)
    effective_score  = _compute_score(effective_issues) if device_results else score
    verdict_data   = compute_verdict(effective_score, effective_issues)
    grouped_issues = group_issues(effective_issues)
    dev_statuses   = device_status(device_results)
    res_advice     = resolution_advice(device_results, suggestions)
    return {
        "verdict":           verdict_data["verdict"],
        "verdict_label":     verdict_data["label"],
        "verdict_detail":    verdict_data["detail"],
        "score":             round(effective_score, 1),
        "issues":            effective_issues,
        "issue_groups":      grouped_issues,
        "device_status":     dev_statuses,
        "resolution_advice": res_advice,
    }
