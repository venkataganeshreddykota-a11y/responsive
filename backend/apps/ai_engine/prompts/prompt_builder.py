import json


SYSTEM_PROMPT = """You are an expert responsive web repair engineer.
Return only valid JSON with fixed_css, fixed_html, and fixed_js keys.
Generate a complete patch for a live device preview. Use CSS for styling, HTML
for small structure/class/attribute repairs, and JavaScript for small behavior
or DOM-placement repairs. Do not default to CSS-only when the root cause is
structure, source order, runtime placement, or interaction state. Use targeted
media queries and preserve desktop behavior.
Avoid external imports, destructive global resets, unsafe scripts, or wholesale
rewrites. Buttons and calls to action may be resized or repositioned when that
is required for the repair, but the final result must keep them visible,
aligned with their related content, reachable, and inside the viewport.
You are allowed to analyze and repair HTML, CSS, and JavaScript together,
BUT you must preserve the original layout semantics and visual identity."""


def _clip(value, limit):
    text = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)
    return text[:limit]


def build_prompt(payload):
    device = payload.get("device") or {}
    issues = payload.get("issues") or []
    html = _clip(payload.get("html") or "", 18000)
    css = _clip(payload.get("css") or "", 18000)
    js = _clip(payload.get("js") or "", 9000)
    dom = _clip(payload.get("dom") or {}, 9000)
    previous_patch = _clip(payload.get("previous_patch") or {}, 9000)
    validation_notes = _clip(payload.get("validation_notes") or [], 5000)
    require_structural_patch = bool(payload.get("require_structural_patch"))

    task = """You are an advanced AI-powered responsive layout repair engine.
        You receive:
- HTML
- CSS
- JavaScript
- viewport/device information
- DOM structure
- screenshot/layout context

Your task is to intelligently repair responsive issues while preserving the original visual design, layout semantics, and user experience.

PRIMARY OBJECTIVE:
Preserve the original UI appearance and layout intent while making the page fully responsive across mobile, tablet, and desktop devices.

You are NOT allowed to apply destructive fixes that change the intended design structure.

==================================================
CORE RESPONSIVE REPAIR RULES
==================================================

1. PRESERVE VISUAL DESIGN
- Maintain original visual hierarchy.
- Preserve spacing relationships.
- Preserve alignment of buttons, cards, hero sections, forms, logos, and navigation.
- Keep CTA buttons in their intended visual positions.
- Maintain original section composition as closely as possible.

2. PRESERVE LAYOUT SEMANTICS
Do not destroy:
- flex layouts
- grid layouts
- container systems
- alignment logic
- responsive component behavior

Extend existing layouts safely instead of replacing them.

3. FIX ROOT CAUSES - NOT JUST OVERFLOW
Do not merely hide overflow.

Instead:
- identify which container or component causes layout breakage
- repair the actual responsive structure
- preserve usability and composition

4. SAFE CSS STRATEGIES ONLY
Prefer:
- flex-wrap
- grid-template adjustments
- min-width:0
- max-width:100%
- clamp()
- responsive spacing
- media queries
- intrinsic sizing
- aspect-ratio preservation
- responsive typography scaling

Avoid:
- transform:scale()
- arbitrary translate()
- negative margins
- forced overflow hiding
- clipping important controls
- pushing controls outside the viewport
- random width shrinking
- unsafe absolute positioning hacks

5. HTML REPAIR RULES
HTML changes are required when CSS alone would create drift, overlap, clipping,
bad source order, unreachable controls, or detached CTA/button placement.

Allowed:
- wrapping overflowing elements
- adding responsive utility containers
- improving semantic grouping
- adding missing responsive wrappers
- moving a CTA/button back into the section or card it visually belongs to
- adding/removing classes or attributes needed by responsive CSS

Avoid:
- removing important content
- restructuring entire sections unnecessarily
- deleting interactive elements
- changing accessibility semantics

6. JAVASCRIPT REPAIR RULES
JS modifications are required when responsive behavior depends on runtime state,
computed dimensions, menu toggles, carousel calculations, sticky/fixed placement,
or DOM relocation that CSS cannot safely express.

Allowed:
- resize listeners
- responsive menu fixes
- carousel recalculations
- viewport-aware layout updates
- debounced resize handlers
- small DOM placement repairs for misplaced buttons or controls

Avoid:
- rewriting unrelated logic
- breaking app state
- modifying business functionality

7. PROTECT HIGH-IMPORTANCE UI ELEMENTS
Treat these as layout anchors:
- CTA buttons
- navigation
- hero text
- primary images
- forms
- modals
- cards
- pricing sections

These elements must:
- remain visible
- remain aligned
- not overlap
- not move unpredictably

8. VISUAL STABILITY VALIDATION
Before finalizing:
- ensure before/after layouts remain visually similar
- ensure CTA buttons did not drift
- ensure hero composition is preserved
- ensure spacing remains balanced
- ensure readability remains high

Reject fixes that:
- significantly shift important elements
- distort layouts
- compress UI unnaturally
- reduce usability

9. RESPONSIVE QUALITY TARGETS
Final layout must:
- avoid horizontal scrolling
- avoid clipped content
- avoid overlap
- maintain readable typography
- preserve touch accessibility
- support mobile/tablet/desktop breakpoints

10. MINIMIZE PATCH SIZE
Generate the smallest safe repair possible.

Avoid:
- rewriting entire stylesheets
- replacing large DOM sections
- generating unnecessary CSS

11. MULTI-PART PATCH DECISION
Return fixed_html and/or fixed_js when either is needed to keep the repaired UI
stable. A CSS-only patch is acceptable only when it fixes the issue without
moving anchors, hiding content, changing source order, or creating a new issue.
If a CSS rule fixes overflow but pushes a button to the side, include HTML or JS
that restores the button to the correct container/position. Do not leave HTML
and JS empty just because CSS can partially reduce overflow.

HTML patch format:
- fixed_html must be either an empty string or a small replacement fragment.
- Prefer a top-level element with data-responsive-selector="<selector>" where
  <selector> matches the original element to replace.
- data-responsive-selector must be a valid CSS selector. Use ".className" for
  classes, "#id" for ids, and never use a bare generated class name.
- Preserve the original text, aria attributes, hrefs, button types, and classes
  unless the change is explicitly needed for responsiveness.

JS patch format:
- fixed_js must be either an empty string or a small self-contained patch.
- It runs with document and window available.
- Keep it idempotent; mark inserted wrappers/listeners with data attributes when
  needed so repeated Apply Fix does not duplicate nodes or listeners.

==================================================
OUTPUT FORMAT
==================================================

Return:
1. CSS patch
2. HTML patch (empty string only when not needed)
3. JS patch (empty string only when not needed)
4. Explanation of each fix
5. Risk level of each modification

==================================================
PATCH GENERATION PRIORITY
==================================================

Priority order:
1. Preserve design
2. Preserve layout semantics
3. Preserve CTA positioning
4. Fix responsiveness
5. Minimize code changes
6. Optimize polish

A responsive fix is considered SUCCESSFUL only if:
- overflow is removed
- layout remains visually correct
- important elements stay aligned
- the UI still looks like the original design
- usability is preserved
- no new issue is introduced by the CSS patch; if one is likely, HTML/JS is
  included to prevent it."""
    if require_structural_patch:
        task += """

STRUCTURAL RETRY REQUIREMENT:
The previous response was CSS-only or introduced a secondary layout risk. Recheck
the HTML and JavaScript. If any CTA, button, card, menu, or content group may
move away from its intended container, overlap, or rely on runtime positioning,
you must return fixed_html and/or fixed_js along with CSS. Only leave both empty
when you can explain why the source structure and behavior are already correct.

Do not use overflow-x hidden, clipping, transform scale, translate-based
viewport clamping, or removal of important controls. Preserve CTA visibility and
button accessibility. Prefer flex-wrap, min-width: 0, fluid max-width/width,
and grid/flex breakpoint changes that let pills, buttons, and labels wrap."""

    user_prompt = {
        "task": task,
        "device": device,
        "responsive_issues": issues,
        "dom_information": dom,
        "html_excerpt": html,
        "css_excerpt": css,
        "js_excerpt": js,
        "previous_patch": previous_patch,
        "validation_notes": validation_notes,
        "require_structural_patch": require_structural_patch,
        "response_schema": {
            "fixed_css": "string",
            "fixed_html": "string; small replacement fragment with data-responsive-selector when markup repair is needed, otherwise empty string",
            "fixed_js": "string; small idempotent JavaScript patch when behavior or DOM placement repair is needed, otherwise empty string",
            "optional_html": "string for backward compatibility; prefer fixed_html",
            "confidence": "number from 0 to 1",
            "explanation": "short string",
            "device_fixes": ["short strings"],
        },
    }
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": json.dumps(user_prompt, ensure_ascii=False)},
    ]
