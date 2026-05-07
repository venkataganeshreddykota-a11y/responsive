import base64
import os
import tempfile
import logging
import json
import re
import requests
from urllib.parse import urljoin, urlparse, quote
from http.cookies import SimpleCookie
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from django.db.models import Prefetch
from django.http import HttpResponse, JsonResponse
from django.views.decorators.csrf import csrf_exempt

from .models import ScanURL, ScanReport
from .serializers import ScanURLSerializer, ScanReportSerializer, ScanTriggerSerializer
from . import tasks

logger = logging.getLogger(__name__)
# -- Google OAuth helpers --
try:
    from google_auth_oauthlib.flow import Flow
    from googleapiclient.discovery import build as gdrive_build
    from googleapiclient.http import MediaFileUpload
    GDRIVE_AVAILABLE = True
except ImportError:
    GDRIVE_AVAILABLE = False

_GDRIVE_SCOPES = ['https://www.googleapis.com/auth/drive']
_GDRIVE_SESSION_KEY = 'gdrive_credentials'




class ScanURLViewSet(viewsets.ModelViewSet):
    serializer_class = ScanURLSerializer
    permission_classes = [permissions.AllowAny]

    def get_queryset(self):
        reports_qs = (
            ScanReport.objects
            .defer("screenshots", "suggestions", "device_results", "raw_result")
            .order_by("id")
        )
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
    try:
        scan_url, _ = ScanURL.objects.get_or_create(url=url)
        report = ScanReport.objects.create(scan_url=scan_url, status="pending")
        tasks.dispatch(report.pk, url)
    except Exception as exc:
        logger.error("trigger_scan error for url=%s: %s", url, exc, exc_info=True)
        return Response({"detail": str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

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


@api_view(["POST"])
@permission_classes([permissions.AllowAny])
def ai_code_context(request):
    url = (request.data.get("url") or "").strip()
    device = request.data.get("device") or {}

    if not url:
        return Response({"detail": "url is required."}, status=status.HTTP_400_BAD_REQUEST)
    if not url.startswith(("http://", "https://")):
        return Response({"detail": "url must start with http:// or https://"}, status=status.HTTP_400_BAD_REQUEST)

    try:
        from .ai_engine.ai_service import is_sarvam_configured
        from .ai_engine.html_extractor import extract_from_url

        extracted = extract_from_url(url)
        return Response({
            "original_html": extracted.get("html", ""),
            "original_css": extracted.get("css", ""),
            "css_sources": extracted.get("css_sources", []),
            "generated_css": "",
            "issues": request.data.get("issues") or [],
            "device_name": device.get("name") or device.get("label") or "",
            "resolution": f"{device.get('width')}x{device.get('height')}" if device.get("width") and device.get("height") else "",
            "ai_available": is_sarvam_configured(),
            "config_warning": "" if is_sarvam_configured() else "SARVAM_API_KEY is not configured. CSS extraction and issue review are available, but AI generation is disabled.",
        })
    except Exception as exc:
        logger.error("ai_code_context error for url=%s: %s", url, exc, exc_info=True)
        return Response({
            "detail": "Could not extract HTML/CSS for this URL.",
            "error": str(exc),
        }, status=status.HTTP_502_BAD_GATEWAY)


@api_view(["POST"])
@permission_classes([permissions.AllowAny])
def ai_fix(request):
    url = (request.data.get("url") or "").strip()

    if not url:
        return Response({"detail": "url is required."}, status=status.HTTP_400_BAD_REQUEST)
    if not url.startswith(("http://", "https://")):
        return Response({"detail": "url must start with http:// or https://"}, status=status.HTTP_400_BAD_REQUEST)

    try:
        from .ai_engine import generate_responsive_fix
        result = generate_responsive_fix({
            "url": url,
            "html": request.data.get("html") or "",
            "css": request.data.get("css") or "",
            "dom": request.data.get("dom") or {},
            "issues": request.data.get("issues") or [],
            "device": request.data.get("device") or {},
        })
        return Response(result)
    except ValueError as exc:
        message = str(exc)
        if "SARVAM_API_KEY is not configured" not in message:
            return Response({
                "detail": message,
                "code": "sarvam_generation_failed",
                "ai_available": True,
            }, status=status.HTTP_502_BAD_GATEWAY)
        return Response({
            "detail": message,
            "code": "sarvam_not_configured",
            "ai_available": False,
        }, status=status.HTTP_503_SERVICE_UNAVAILABLE)
    except Exception as exc:
        logger.error("ai_fix error for url=%s: %s", url, exc, exc_info=True)
        return Response({"detail": str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["GET"])
@permission_classes([permissions.AllowAny])
def live_device_preview(request):
    target_url = (request.GET.get("url") or "").strip()
    if not target_url:
        return HttpResponse("Missing URL", status=400)
    if not target_url.startswith(("http://", "https://")):
        return HttpResponse("Only http/https URLs are supported.", status=400)

    try:
        width = int(request.GET.get("width") or 390)
        height = int(request.GET.get("height") or 844)
    except (TypeError, ValueError):
        return HttpResponse("width and height must be valid integers.", status=400)

    width = max(240, min(width, 5120))
    height = max(240, min(height, 5120))
    device_key = (request.GET.get("device_key") or "").strip()
    label = (request.GET.get("label") or "").strip()

    try:
        from .playwright_engine import render_device_screenshot

        image = render_device_screenshot(
            target_url,
            device_key=device_key,
            label=label,
            width=width,
            height=height,
            full_page=True,
        )
    except Exception as exc:
        logger.error("live_device_preview error for url=%s: %s", target_url, exc, exc_info=True)
        return HttpResponse(f"Playwright preview failed: {exc}", status=502)

    response = HttpResponse(image, content_type="image/png")
    response["Cache-Control"] = "no-store"
    response["X-Responsive-Tool-Renderer"] = "playwright"
    return response


PROXY_TIMEOUT = 30

MOBILE_USER_AGENT = (
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) "
    "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 "
    "Mobile/15E148 Safari/604.1"
)

DESKTOP_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 Chrome/124.0 Safari/537.36"
)


def _device_context_from_request(request):
    """Read Live View device hints from the frontend proxy request."""
    try:
        width = int(request.GET.get("rt_width") or 0)
    except (TypeError, ValueError):
        width = 0
    try:
        height = int(request.GET.get("rt_height") or 0)
    except (TypeError, ValueError):
        height = 0

    explicit_mobile = str(request.GET.get("rt_mobile", "")).lower() in {"1", "true", "yes"}
    is_mobile = explicit_mobile or (0 < width <= 480)
    return {
        "width": width,
        "height": height,
        "is_mobile": is_mobile,
        "user_agent": MOBILE_USER_AGENT if is_mobile else DESKTOP_USER_AGENT,
    }


def _proxy_url(target_url, device_context=None):
    """Return the local proxy path for a given absolute URL."""
    url = f"/api/scanner/proxy/?url={quote(target_url, safe='')}"
    if device_context:
        width = int(device_context.get("width") or 0)
        height = int(device_context.get("height") or 0)
        is_mobile = "1" if device_context.get("is_mobile") else "0"
        if width:
            url += f"&rt_width={width}"
        if height:
            url += f"&rt_height={height}"
        url += f"&rt_mobile={is_mobile}"
    return url


def _copy_rewritten_cookies(source_response, proxy_response):
    """Copy target cookies as host-only proxy cookies so session flows work in Live View."""
    try:
        cookie_headers = source_response.raw.headers.get_all('Set-Cookie')
    except AttributeError:
        cookie_header = source_response.headers.get('Set-Cookie')
        cookie_headers = [cookie_header] if cookie_header else []

    for header in cookie_headers or []:
        cookie = SimpleCookie()
        try:
            cookie.load(header)
        except Exception:
            continue

        for name, morsel in cookie.items():
            max_age = morsel['max-age'] or None
            if max_age is not None:
                try:
                    max_age = int(float(max_age))
                except (TypeError, ValueError):
                    max_age = None

            proxy_response.set_cookie(
                key=name,
                value=morsel.value,
                max_age=max_age,
                expires=morsel['expires'] or None,
                path='/',
                secure=False,
                httponly=bool(morsel['httponly']),
                samesite='Lax',
            )


def _rewrite_html(html, base_url, device_context=None):
    """
    Rewrite every URL in the HTML so it routes back through our proxy.
    Handles: src=, href=, action=, srcset=, url() in inline styles,
    meta refresh, and injects a JS shim to intercept runtime navigation.
    """
    parsed = urlparse(base_url)
    origin = f"{parsed.scheme}://{parsed.netloc}"
    target_path = parsed.path or "/"
    if parsed.query:
        target_path = f"{target_path}?{parsed.query}"
    if parsed.fragment:
        target_path = f"{target_path}#{parsed.fragment}"
    # Calculate base path - if URL ends with / or has no extension, use as-is
    # Otherwise, strip the filename
    path = parsed.path
    if path.endswith('/') or '.' not in path.split('/')[-1]:
        base_path = path.rstrip('/')
    else:
        base_path = path.rsplit('/', 1)[0] if '/' in path else ''

    def make_absolute(url):
        url = url.strip()
        if not url or url.startswith(("data:", "javascript:", "mailto:", "#")):
            return url
        if url.startswith("//"):
            return _proxy_url("https:" + url, device_context)
        if url.startswith(("http://", "https://")):
            return _proxy_url(url, device_context)
        # Handle absolute paths from root
        if url.startswith('/'):
            return _proxy_url(origin + url, device_context)
        # Handle relative paths
        return _proxy_url(urljoin(base_url, url), device_context)

    def rewrite_attr(match):
        attr  = match.group(1)   # e.g. src, href, action
        quote_char = match.group(2)
        url   = match.group(3)
        return f'{attr}={quote_char}{make_absolute(url)}{quote_char}'

    def rewrite_srcset(match):
        attr = match.group(1)
        quote_char = match.group(2)
        srcset = match.group(3)
        parts = []
        for entry in srcset.split(","):
            entry = entry.strip()
            if not entry:
                continue
            pieces = entry.split()
            pieces[0] = make_absolute(pieces[0])
            parts.append(" ".join(pieces))
        return f'{attr}={quote_char}{", ".join(parts)}{quote_char}'

    def rewrite_css_url(match):
        url = match.group(1).strip("'\"")
        return f'url({make_absolute(url)})'

    def rewrite_meta_refresh(match):
        """Rewrite <meta http-equiv="refresh" content="N; url=...">"""
        full = match.group(0)
        def replace_url(m):
            raw = m.group(1)
            abs_url = raw if raw.startswith(("http://", "https://")) else urljoin(base_url, raw)
            return f'url={_proxy_url(abs_url, device_context)}'
        return re.sub(r'url=([^\s"\'>;]+)', replace_url, full, flags=re.IGNORECASE)

    # Rewrite src, href, action attributes (quoted)
    html = re.sub(
        r'(src|href|action)=(["\'])([^"\'>\s]+)\2',
        rewrite_attr,
        html,
        flags=re.IGNORECASE,
    )

    # Rewrite lazy-load data-src / data-href attributes used by most modern sites
    html = re.sub(
        r'(data-src|data-href|data-lazy|data-original)=(["\'])([^"\'>\s]+)\2',
        rewrite_attr,
        html,
        flags=re.IGNORECASE,
    )

    # Rewrite srcset
    html = re.sub(
        r'(srcset)=(["\'])([^"\']+)\2',
        rewrite_srcset,
        html,
        flags=re.IGNORECASE,
    )

    # Rewrite url() in inline styles
    html = re.sub(
        r'url\(([^)]+)\)',
        rewrite_css_url,
        html,
        flags=re.IGNORECASE,
    )

    # Rewrite meta refresh redirects
    html = re.sub(
        r'<meta[^>]+http-equiv=["\']refresh["\'][^>]*>',
        rewrite_meta_refresh,
        html,
        flags=re.IGNORECASE,
    )

    # IMPORTANT: Inject base tag BEFORE the nav shim so the regex can find <head>
    # Rewrite <base href> to point through the proxy instead of removing it
    # This is critical for SPAs that rely on base for asset resolution
    def rewrite_base(match):
        # Extract the href value
        href_match = re.search(r'href=(["\'])([^"\']+)\1', match.group(0), re.IGNORECASE)
        if href_match:
            original_href = href_match.group(2)
            # Make it absolute and proxy it
            if original_href.startswith('/'):
                new_href = _proxy_url(origin + original_href, device_context)
            elif original_href.startswith(('http://', 'https://')):
                new_href = _proxy_url(original_href, device_context)
            else:
                new_href = _proxy_url(urljoin(base_url, original_href), device_context)
            return f'<base href="{new_href}">'
        # If no href found, inject one pointing to the origin through proxy
        if base_path:
            return f'<base href="{_proxy_url(origin + base_path + "/", device_context)}">'
        else:
            return f'<base href="{_proxy_url(origin + "/", device_context)}">'

    html = re.sub(r'<base[^>]*>', rewrite_base, html, flags=re.IGNORECASE)

    # If no base tag exists, inject one for SPAs (they often need it)
    has_base = bool(re.search(r'<base[^>]*>', html, re.IGNORECASE))
    logger.debug(f"Base tag exists after rewrite: {has_base}")

    if not has_base:
        # Construct the base URL properly
        if base_path:
            base_href = _proxy_url(origin + base_path + "/", device_context)
        else:
            base_href = _proxy_url(origin + "/", device_context)
        base_tag = f'<base href="{base_href}">'
        logger.debug(f"Injecting base tag: {base_tag}")

        has_head = bool(re.search(r"<head[^>]*>", html, re.IGNORECASE))
        logger.debug(f"Head tag found: {has_head}")

        if has_head:
            html = re.sub(r"(<head[^>]*>)", r"\1" + base_tag, html, count=1, flags=re.IGNORECASE)
            logger.debug(f"Base tag injected after <head>")
        else:
            # No head tag, inject at the start
            html = base_tag + html
            logger.debug(f"Base tag injected at start (no head tag)")

    is_mobile_preview = bool(device_context and device_context.get("is_mobile"))
    if is_mobile_preview:
        viewport_content = "width=device-width, initial-scale=1, viewport-fit=cover"
        if re.search(r'<meta[^>]+name=["\']viewport["\'][^>]*>', html, re.IGNORECASE):
            def rewrite_viewport(match):
                tag = match.group(0)
                if re.search(r'content=(["\'])(.*?)\1', tag, re.IGNORECASE):
                    return re.sub(
                        r'content=(["\'])(.*?)\1',
                        f'content="{viewport_content}"',
                        tag,
                        count=1,
                        flags=re.IGNORECASE,
                    )
                return tag[:-1] + f' content="{viewport_content}">'

            html = re.sub(
                r'<meta[^>]+name=["\']viewport["\'][^>]*>',
                rewrite_viewport,
                html,
                count=1,
                flags=re.IGNORECASE,
            )
        elif re.search(r"<head[^>]*>", html, re.IGNORECASE):
            html = re.sub(
                r"(<head[^>]*>)",
                r'\1<meta name="viewport" content="' + viewport_content + r'">',
                html,
                count=1,
                flags=re.IGNORECASE,
            )

    device_query = ""
    if device_context:
        parts = []
        if device_context.get("width"):
            parts.append(f"rt_width={int(device_context['width'])}")
        if device_context.get("height"):
            parts.append(f"rt_height={int(device_context['height'])}")
        parts.append(f"rt_mobile={'1' if device_context.get('is_mobile') else '0'}")
        device_query = "&" + "&".join(parts)

    emulated_user_agent = (device_context or {}).get("user_agent", DESKTOP_USER_AGENT)
    emulated_platform = "iPhone" if is_mobile_preview else "Win32"
    emulated_max_touch_points = 5 if is_mobile_preview else 0
    emulated_user_agent_data = {
        "mobile": is_mobile_preview,
        "platform": "iOS" if is_mobile_preview else "Windows",
    }

    # Inject a JS shim that intercepts runtime navigation so the iframe
    # never escapes the proxy (handles window.location, history API, etc.)
    nav_shim = f"""<script>
try {{
  window.__RESPONSIVE_TOOL_PROXY_ACTIVE = true;
  window.__RESPONSIVE_TOOL_TARGET_ORIGIN = {json.dumps(origin)};
  Object.defineProperty(navigator, 'userAgent', {{ get: function() {{ return {json.dumps(emulated_user_agent)}; }}, configurable: true }});
  Object.defineProperty(navigator, 'appVersion', {{ get: function() {{ return {json.dumps(emulated_user_agent)}; }}, configurable: true }});
  Object.defineProperty(navigator, 'platform', {{ get: function() {{ return {json.dumps(emulated_platform)}; }}, configurable: true }});
  Object.defineProperty(navigator, 'maxTouchPoints', {{ get: function() {{ return {emulated_max_touch_points}; }}, configurable: true }});
  Object.defineProperty(navigator, 'userAgentData', {{ get: function() {{ return {json.dumps(emulated_user_agent_data)}; }}, configurable: true }});
}} catch(e) {{}}

// Neutralize Service Workers
if ('serviceWorker' in navigator) {{
  Object.defineProperty(navigator, 'serviceWorker', {{
    value: {{
      register: function() {{ return Promise.reject(new Error('Service Workers disabled by proxy')); }},
      ready: new Promise(function() {{}}),
      getRegistrations: function() {{ return Promise.resolve([]); }}
    }},
    configurable: true
  }});
}}

(function() {{
  // Use relative path so it works regardless of how the backend is accessed
  var _PROXY = '/api/scanner/proxy/?url=';
  var _DEVICE_QUERY = {json.dumps(device_query)};
  var _ORIGIN = '{origin}';
  var _BASE_PATH = '{base_path}';
  var _TARGET_PATH = {json.dumps(target_path)};

  // SPAs read window.location.pathname during startup. The iframe is loaded
  // through /api/scanner/proxy/, so expose the target route before app code runs.
  try {{
    if (window.location.pathname !== _TARGET_PATH.split(/[?#]/)[0]) {{
      history.replaceState(history.state, document.title, _TARGET_PATH);
    }}
  }} catch(e) {{}}

  function toProxyUrl(url) {{
    if (!url || url.startsWith('data:') || url.startsWith('javascript:') || url.startsWith('#')) return url;
    if (url.startsWith('//')) url = 'https:' + url;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {{
      // Handle absolute paths from root
      if (url.startsWith('/')) {{
        url = _ORIGIN + url;
      }} else {{
        // Handle relative paths
        url = _ORIGIN + _BASE_PATH + '/' + url;
      }}
    }}
    // Don't double-proxy
    if (url.indexOf('/api/scanner/proxy/') !== -1) return url;
    return _PROXY + encodeURIComponent(url) + _DEVICE_QUERY;
  }}

  function toAppHistoryUrl(url) {{
    if (!url || url.startsWith('#')) return url;
    try {{
      var absolute = new URL(url, _ORIGIN + (_BASE_PATH || '/') + '/');
      if (absolute.origin === _ORIGIN) {{
        return absolute.pathname + absolute.search + absolute.hash;
      }}
      return toProxyUrl(absolute.href);
    }} catch(e) {{
      return url;
    }}
  }}

  // Intercept window.location.href assignments via a polling approach
  // (Object.defineProperty on window.location throws in all modern browsers)
  var _lastHref = window.location.href;
  var _origAssign = window.location.assign.bind(window.location);
  var _origReplace = window.location.replace.bind(window.location);

  try {{
    window.location.assign = function(url) {{ _origAssign(toProxyUrl(url)); }};
    window.location.replace = function(url) {{ _origReplace(toProxyUrl(url)); }};
  }} catch(e) {{}}

  // Intercept history.pushState / replaceState
  var _push = history.pushState.bind(history);
  var _replace = history.replaceState.bind(history);
  history.pushState = function(state, title, url) {{
    if (url) url = toAppHistoryUrl(url);
    return _push(state, title, url);
  }};
  history.replaceState = function(state, title, url) {{
    if (url) url = toAppHistoryUrl(url);
    return _replace(state, title, url);
  }};

  // Intercept window.open
  var _origOpen = window.open.bind(window);
  window.open = function(url, target, features) {{
    return _origOpen(url ? toProxyUrl(url) : url, target, features);
  }};

  // Intercept link clicks (handles JS-driven navigation too)
  document.addEventListener('click', function(e) {{
    var el = e.target.closest('a[href]');
    if (!el) return;
    var href = el.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:')) return;
    e.preventDefault();
    window.location.href = toProxyUrl(href);
  }}, true);

  // Intercept GET form submissions
  document.addEventListener('submit', function(e) {{
    var form = e.target;
    if (!form || (form.method && form.method.toLowerCase() === 'post')) return;
    var action = form.getAttribute('action') || window.location.href;
    var params = new URLSearchParams(new FormData(form)).toString();
    e.preventDefault();
    window.location.href = toProxyUrl(action + (params ? '?' + params : ''));
  }}, true);

  // Neutralize WebSockets
  window.WebSocket = function() {{
    console.warn("WebSockets are disabled in Live View proxy.");
    // Return a dummy object that absorbs event listeners without crashing
    return {{
      addEventListener: function() {{}},
      send: function() {{}},
      close: function() {{}},
      readyState: 3 // CLOSED
    }};
  }};

  // Intercept Fetch API
  var originalFetch = window.fetch;
  window.fetch = async function(resource, init) {{
    var targetUrl = resource instanceof Request ? resource.url : resource;
    // Route absolute and root-relative requests through the proxy.
    if (typeof targetUrl === 'string' && targetUrl.indexOf('/api/scanner/proxy/') === -1) {{
      targetUrl = toProxyUrl(targetUrl);
      if (resource instanceof Request) {{
        resource = new Request(targetUrl, init);
      }} else {{
        resource = targetUrl;
      }}
    }}
    return originalFetch.call(this, resource, init);
  }};

  // Intercept XHR
  var originalXHR = window.XMLHttpRequest.prototype.open;
  window.XMLHttpRequest.prototype.open = function(method, url) {{
    var rest = Array.prototype.slice.call(arguments, 2);
    if (typeof url === 'string' && url.indexOf('/api/scanner/proxy/') === -1) {{
      url = toProxyUrl(url);
    }}
    return originalXHR.apply(this, [method, url].concat(rest));
  }};
}})();
</script>"""

    # Inject shim as early as possible, right after the base tag (or <head> if no base).
    if re.search(r"<base[^>]*>", html, re.IGNORECASE):
        # Inject after the base tag we just added
        html = re.sub(r"(<base[^>]*>)", r"\1" + nav_shim, html, count=1, flags=re.IGNORECASE)
    elif re.search(r"<head[^>]*>", html, re.IGNORECASE):
        html = re.sub(r"(<head[^>]*>)", r"\1" + nav_shim, html, count=1, flags=re.IGNORECASE)
    else:
        html = nav_shim + html

    return html


@api_view(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])
@permission_classes([permissions.AllowAny])
def iframe_proxy(request):
    target_url = request.GET.get('url', '').strip()
    if not target_url:
        return HttpResponse("Missing URL", status=400)
    if not target_url.startswith(("http://", "https://")):
        return HttpResponse("Only http/https URLs are supported.", status=400)

    logger.info(f"Proxy request for: {target_url}")
    device_context = _device_context_from_request(request)

    if request.method == 'OPTIONS':
        response = HttpResponse(status=204)
        response['Access-Control-Allow-Origin'] = '*'
        response['Access-Control-Allow-Methods'] = 'GET, POST, PUT, PATCH, DELETE, OPTIONS'
        response['Access-Control-Allow-Headers'] = request.headers.get(
            'Access-Control-Request-Headers',
            'Content-Type, Authorization, X-Requested-With',
        )
        response['Access-Control-Max-Age'] = '86400'
        return response

    request_headers = {
        'User-Agent': device_context["user_agent"],
        'Accept': request.headers.get(
            'Accept',
            'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        ),
        'Accept-Language': request.headers.get('Accept-Language', 'en-US,en;q=0.9'),
        'Accept-Encoding': 'gzip, deflate',
        'Referer': target_url,
        'Origin': f"{urlparse(target_url).scheme}://{urlparse(target_url).netloc}",
    }
    if device_context["is_mobile"]:
        request_headers.update({
            'Sec-CH-UA-Mobile': '?1',
            'Sec-CH-UA-Platform': '"iOS"',
        })
    if request.content_type:
        request_headers['Content-Type'] = request.content_type
    if request.headers.get('Authorization'):
        request_headers['Authorization'] = request.headers['Authorization']
    if request.headers.get('Cookie'):
        request_headers['Cookie'] = request.headers['Cookie']

    try:
        resp = requests.request(
            request.method,
            target_url,
            headers=request_headers,
            data=request.body if request.method in {'POST', 'PUT', 'PATCH', 'DELETE'} else None,
            timeout=PROXY_TIMEOUT,
            allow_redirects=True,
            verify=True,
        )
        logger.info(f"Proxy response: {resp.status_code}, Content-Type: {resp.headers.get('Content-Type')}, Size: {len(resp.content)} bytes")
    except requests.exceptions.Timeout:
        logger.error(f"Proxy timeout for: {target_url}")
        return HttpResponse("Target URL timed out.", status=504)
    except requests.exceptions.SSLError as exc:
        logger.error(f"SSL error for {target_url}: {exc}")
        return HttpResponse(f"SSL certificate error: {exc}", status=502)
    except requests.exceptions.RequestException as exc:
        logger.error(f"Proxy error for {target_url}: {exc}")
        return HttpResponse(f"Proxy fetch error: {exc}", status=502)

    content_type = resp.headers.get('Content-Type', 'application/octet-stream')

    # Handle cases where content-type is missing but URL suggests type
    if 'application/octet-stream' in content_type or not content_type:
        parsed_url = urlparse(target_url)
        path = parsed_url.path.lower()
        if path.endswith('.js') or path.endswith('.mjs'):
            content_type = 'application/javascript'
        elif path.endswith('.css'):
            content_type = 'text/css'
        elif path.endswith('.json'):
            content_type = 'application/json'
        elif path.endswith(('.html', '.htm')):
            content_type = 'text/html'

    _BLOCKED = {
        'x-frame-options', 'content-security-policy', 'content-security-policy-report-only',
        'strict-transport-security', 'transfer-encoding', 'content-encoding',
        'content-length',
        'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
        'te', 'trailers', 'upgrade',
        'set-cookie',
        # Prevent nosniff from blocking proxied JS/CSS with rewritten content-types
        'x-content-type-options',
        # Prevent referrer leaking the proxy URL to external servers
        'referrer-policy',
    }

    if 'text/html' in content_type:
        content = resp.content.decode('utf-8', errors='ignore')

        # Strip SRI integrity and crossorigin attrs because proxy rewrites URLs so hashes won't match.
        content = re.sub(r'\s+integrity=["\'][^"\']*["\']', '', content, flags=re.IGNORECASE)
        content = re.sub(r'\s+crossorigin=["\'][^"\']*["\']', '', content, flags=re.IGNORECASE)

        # Rewrite all asset/link URLs to go back through this proxy
        content = _rewrite_html(content, target_url, device_context)

        proxy_response = HttpResponse(content, content_type='text/html; charset=utf-8', status=resp.status_code)

    elif 'text/css' in content_type or 'css' in content_type:
        # Rewrite url() and @import references inside CSS files
        content = resp.content.decode('utf-8', errors='ignore')

        def rewrite_css_ref(m):
            raw = m.group(1).strip().strip("'\"")
            if not raw or raw.startswith('data:'):
                return m.group(0)
            abs_url = raw if raw.startswith(('http://', 'https://')) else urljoin(target_url, raw)
            return f'url({_proxy_url(abs_url, device_context)})'

        content = re.sub(r'url\(\s*([^)]+)\s*\)', rewrite_css_ref, content, flags=re.IGNORECASE)

        # Rewrite @import "url" and @import url("url")
        def rewrite_import(m):
            raw = m.group(1).strip().strip("'\"")
            if raw.startswith('data:'):
                return m.group(0)
            abs_url = raw if raw.startswith(('http://', 'https://')) else urljoin(target_url, raw)
            return f'@import "{_proxy_url(abs_url, device_context)}"'

        content = re.sub(r'@import\s+(?:url\()?["\']?([^"\')\s]+)["\']?\)?', rewrite_import, content, flags=re.IGNORECASE)

        proxy_response = HttpResponse(content, content_type=content_type, status=resp.status_code)

    elif 'javascript' in content_type or 'application/json' in content_type or content_type.startswith('text/javascript') or content_type.startswith('application/x-javascript'):
        # Rewrite root-relative asset strings in JS bundles. Vite/SPA bundles often
        # lazy-load chunks or images from "/assets/..." after the initial HTML parse.
        if 'javascript' in content_type or 'x-javascript' in content_type:
            content = resp.content.decode('utf-8', errors='ignore')
            parsed_target = urlparse(target_url)
            target_origin = f"{parsed_target.scheme}://{parsed_target.netloc}"

            def rewrite_js_asset(m):
                quote_char = m.group(1)
                path = m.group(2)
                return f"{quote_char}{_proxy_url(target_origin + '/' + path, device_context)}{quote_char}"

            content = re.sub(
                r'(["\'])/((?:facthub/)?assets/[^"\']+\.(?:js|mjs|css|png|jpe?g|webp|svg|gif|ico|woff2?|ttf|json|mp4|webm|avif))\1',
                rewrite_js_asset,
                content,
                flags=re.IGNORECASE,
            )

            proxy_response = HttpResponse(content, content_type='application/javascript; charset=utf-8', status=resp.status_code)
        else:
            proxy_response = HttpResponse(resp.content, content_type=content_type, status=resp.status_code)
        logger.debug(f"Proxying JS/JSON: {target_url[:100]}")

    else:
        proxy_response = HttpResponse(resp.content, content_type=content_type, status=resp.status_code)

    for key, value in resp.headers.items():
        if key.lower() not in _BLOCKED:
            proxy_response[key] = value
    _copy_rewritten_cookies(resp, proxy_response)

    proxy_response['Access-Control-Allow-Origin'] = '*'
    proxy_response['Access-Control-Allow-Methods'] = 'GET, POST, PUT, PATCH, DELETE, OPTIONS'
    proxy_response['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-Requested-With'
    # Explicitly allow framing and disable nosniff for proxied content
    proxy_response['X-Frame-Options'] = 'ALLOWALL'
    proxy_response['X-Content-Type-Options'] = ''
    proxy_response['Cache-Control'] = 'no-store'
    return proxy_response



# Google Drive OAuth endpoints

def _build_flow(request):
    """Create an OAuth Flow from env vars."""
    client_id     = os.environ.get("GOOGLE_OAUTH_CLIENT_ID", "")
    client_secret = os.environ.get("GOOGLE_OAUTH_CLIENT_SECRET", "")
    redirect_uri  = os.environ.get(
        "GOOGLE_OAUTH_REDIRECT_URI",
        request.build_absolute_uri("/api/scanner/gdrive/callback/"),
    )
    client_config = {
        "web": {
            "client_id": client_id,
            "client_secret": client_secret,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": [redirect_uri],
        }
    }
    flow = Flow.from_client_config(client_config, scopes=_GDRIVE_SCOPES)
    flow.redirect_uri = redirect_uri
    return flow


@api_view(["GET"])
@permission_classes([permissions.AllowAny])
def gdrive_auth_start(request):
    """Return the Google OAuth consent URL for the frontend to redirect to."""
    if not GDRIVE_AVAILABLE:
        return Response({"detail": "google-auth-oauthlib not installed."}, status=501)
    if not os.environ.get("GOOGLE_OAUTH_CLIENT_ID"):
        return Response({"detail": "GOOGLE_OAUTH_CLIENT_ID not configured."}, status=503)

    flow = _build_flow(request)
    auth_url, state = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
    )
    # Store state in session for CSRF validation
    request.session["gdrive_oauth_state"] = state
    return Response({"auth_url": auth_url})


@api_view(["GET"])
@permission_classes([permissions.AllowAny])
def gdrive_auth_callback(request):
    """Handle the OAuth callback, store credentials in session, redirect to frontend."""
    if not GDRIVE_AVAILABLE:
        return HttpResponse("google-auth-oauthlib not installed.", status=501)

    state = request.session.get("gdrive_oauth_state", "")
    flow = _build_flow(request)
    flow.state = state

    try:
        flow.fetch_token(
            code=request.GET.get("code", ""),
            state=request.GET.get("state", ""),
        )
        creds = flow.credentials
        request.session[_GDRIVE_SESSION_KEY] = {
            "token":         creds.token,
            "refresh_token": creds.refresh_token,
            "token_uri":     creds.token_uri,
            "client_id":     creds.client_id,
            "client_secret": creds.client_secret,
            "scopes":        list(creds.scopes or _GDRIVE_SCOPES),
        }
    except Exception as exc:
        logger.error("gdrive_auth_callback error: %s", exc)
        frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:3000")
        return HttpResponse(
            f'<script>window.opener?.postMessage({{gdrive:"error",detail:"{exc}"}}, "*"); window.close();</script>',
            content_type="text/html",
        )

    frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:3000")
    return HttpResponse(
        '<script>window.opener?.postMessage({gdrive:"success"}, "*"); window.close();</script>',
        content_type="text/html",
    )


@api_view(["POST"])
@permission_classes([permissions.AllowAny])
def gdrive_upload(request):
    """
    Upload a base64-encoded screenshot to Google Drive.
    Uses session credentials if present, otherwise falls back to
    GOOGLE_OAUTH_REFRESH_TOKEN from env (pre-configured credentials).
    Body: { image_b64: "...", filename: "mobile-screenshot.png" }
    """
    if not GDRIVE_AVAILABLE:
        return Response({"detail": "google-auth-oauthlib not installed."}, status=501)

    from google.oauth2.credentials import Credentials
    from google.auth.transport.requests import Request as GoogleRequest

    creds_data = request.session.get(_GDRIVE_SESSION_KEY)

    # Fall back to env-configured refresh token if no session
    if not creds_data:
        refresh_token = os.environ.get("GOOGLE_OAUTH_REFRESH_TOKEN", "").strip()
        client_id     = os.environ.get("GOOGLE_OAUTH_CLIENT_ID", "").strip()
        client_secret = os.environ.get("GOOGLE_OAUTH_CLIENT_SECRET", "").strip()
        if refresh_token and client_id and client_secret:
            creds_data = {
                "token":         None,
                "refresh_token": refresh_token,
                "token_uri":     "https://oauth2.googleapis.com/token",
                "client_id":     client_id,
                "client_secret": client_secret,
                "scopes":        _GDRIVE_SCOPES,
            }
        else:
            return Response({"detail": "not_authenticated", "auth_required": True}, status=401)

    image_b64 = request.data.get("image_b64", "")
    filename  = request.data.get("filename", "screenshot.png")

    if not image_b64:
        return Response({"detail": "image_b64 is required."}, status=400)

    if "," in image_b64:
        image_b64 = image_b64.split(",", 1)[1]

    try:
        image_bytes = base64.b64decode(image_b64)
    except Exception:
        return Response({"detail": "Invalid base64 data."}, status=400)

    creds = Credentials(
        token=creds_data.get("token"),
        refresh_token=creds_data.get("refresh_token"),
        token_uri=creds_data.get("token_uri", "https://oauth2.googleapis.com/token"),
        client_id=creds_data["client_id"],
        client_secret=creds_data["client_secret"],
        scopes=creds_data.get("scopes", _GDRIVE_SCOPES),
    )

    # Always refresh if token is missing or expired
    try:
        if not creds.valid:
            creds.refresh(GoogleRequest())
    except Exception as exc:
        logger.error("gdrive token refresh failed: %s", exc, exc_info=True)
        request.session.pop(_GDRIVE_SESSION_KEY, None)
        return Response({"detail": "Token refresh failed. Re-authenticate.", "auth_required": True}, status=401)

    try:
        service = gdrive_build("drive", "v3", credentials=creds, cache_discovery=False)

        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
            tmp.write(image_bytes)
            tmp_path = tmp.name

        try:
            media = MediaFileUpload(tmp_path, mimetype="image/png", resumable=False)
            folder_id = os.environ.get("GDRIVE_SCREENSHOTS_FOLDER_ID", "").strip() or None
            metadata = {"name": filename, "mimeType": "image/png"}
            if folder_id:
                metadata["parents"] = [folder_id]

            file_obj = service.files().create(
                body=metadata, media_body=media, fields="id,webViewLink"
            ).execute()
        finally:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass

        # Persist refreshed token back to session
        if creds.token and creds.token != creds_data.get("token"):
            creds_data["token"] = creds.token
            request.session[_GDRIVE_SESSION_KEY] = creds_data

        logger.info("gdrive_upload success: file_id=%s", file_obj["id"])
        return Response({
            "file_id":       file_obj["id"],
            "web_view_link": file_obj.get("webViewLink", ""),
        })

    except Exception as exc:
        logger.error("gdrive_upload error: %s", exc, exc_info=True)
        err_str = str(exc).lower()
        if "invalid_grant" in err_str or "token has been expired" in err_str:
            request.session.pop(_GDRIVE_SESSION_KEY, None)
            return Response({"detail": "not_authenticated", "auth_required": True}, status=401)
        return Response({"detail": str(exc)}, status=500)


@api_view(["GET"])
@permission_classes([permissions.AllowAny])
def gdrive_status(request):
    """
    Check if Drive is ready using either session or env refresh token.
    """
    if _GDRIVE_SESSION_KEY in request.session:
        return Response({"connected": True})

    # Pre-configured via env refresh token counts as connected
    has_env_creds = bool(
        os.environ.get("GOOGLE_OAUTH_REFRESH_TOKEN")
        and os.environ.get("GOOGLE_OAUTH_CLIENT_ID")
        and os.environ.get("GOOGLE_OAUTH_CLIENT_SECRET")
    )
    return Response({"connected": has_env_creds})


@api_view(["POST"])
@permission_classes([permissions.AllowAny])
def gdrive_disconnect(request):
    """Clear the Drive session (env-based credentials are unaffected)."""
    request.session.pop(_GDRIVE_SESSION_KEY, None)
    return Response({"disconnected": True})
