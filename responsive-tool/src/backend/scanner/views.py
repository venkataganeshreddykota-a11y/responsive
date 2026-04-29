import logging
import re
import requests
from urllib.parse import urljoin, urlparse, quote
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from django.db.models import Prefetch
from django.http import HttpResponse

from .models import ScanURL, ScanReport
from .serializers import ScanURLSerializer, ScanReportSerializer, ScanTriggerSerializer
from . import tasks

logger = logging.getLogger(__name__)


class ScanURLViewSet(viewsets.ModelViewSet):
    serializer_class = ScanURLSerializer
    permission_classes = [permissions.AllowAny]

    def get_queryset(self):
        reports_qs = ScanReport.objects.order_by("id")
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
        scan_url, _ = ScanURL.objects.get_or_create(url=url, defaults={"user": None})
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


# Headers that must never be forwarded to the browser — they break iframe embedding
_IFRAME_BLOCK_HEADERS = {
    "x-frame-options",
    "content-security-policy",
    "content-security-policy-report-only",
    "strict-transport-security",
}

# Headers that are hop-by-hop and must not be forwarded
_HOP_BY_HOP_HEADERS = {
    "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
    "te", "trailers", "transfer-encoding", "upgrade",
}

_TIMEOUT = 15  # seconds


def _proxy_url(target_url):
    """Return the local proxy path for a given absolute URL."""
    return f"/api/scanner/proxy/?url={quote(target_url, safe='')}"


def _rewrite_html(html, base_url):
    """
    Rewrite every URL in the HTML so it routes back through our proxy.
    Handles: src=, href=, action=, srcset=, url() in inline styles,
    meta refresh, and injects a JS shim to intercept runtime navigation.
    """
    parsed = urlparse(base_url)
    origin = f"{parsed.scheme}://{parsed.netloc}"

    def make_absolute(url):
        url = url.strip()
        if not url or url.startswith(("data:", "javascript:", "mailto:", "#", "//")):
            if url.startswith("//"):
                return _proxy_url("https:" + url)
            return url
        if url.startswith(("http://", "https://")):
            return _proxy_url(url)
        return _proxy_url(urljoin(base_url, url))

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
            return f'url={_proxy_url(abs_url)}'
        return re.sub(r'url=([^\s"\'>;]+)', replace_url, full, flags=re.IGNORECASE)

    # Strip or rewrite <base href> — it would override all relative URL resolution
    # inside the iframe and break the proxy rewriting
    html = re.sub(r'<base[^>]+>', '', html, flags=re.IGNORECASE)

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

    # Inject a JS shim that intercepts runtime navigation so the iframe
    # never escapes the proxy (handles window.location, history API, etc.)
    nav_shim = f"""<script>
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
  var _PROXY = 'http://localhost:8000/api/scanner/proxy/?url=';
  var _ORIGIN = '{origin}';

  function toProxyUrl(url) {{
    if (!url || url.startsWith('data:') || url.startsWith('javascript:') || url.startsWith('#')) return url;
    if (url.startsWith('//')) url = 'https:' + url;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {{
      url = _ORIGIN + (url.startsWith('/') ? '' : '/') + url;
    }}
    // Don't double-proxy
    if (url.indexOf('localhost:8000/api/scanner/proxy/') !== -1) return url;
    return _PROXY + encodeURIComponent(url);
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
    if (url) url = toProxyUrl(url);
    return _push(state, title, url);
  }};
  history.replaceState = function(state, title, url) {{
    if (url) url = toProxyUrl(url);
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
    var abs = href.startsWith('http://') || href.startsWith('https://')
      ? href
      : (_ORIGIN + (href.startsWith('/') ? '' : '/') + href);
    window.location.href = toProxyUrl(abs);
  }}, true);

  // Intercept GET form submissions
  document.addEventListener('submit', function(e) {{
    var form = e.target;
    if (!form || (form.method && form.method.toLowerCase() === 'post')) return;
    var action = form.getAttribute('action') || window.location.href;
    var abs = action.startsWith('http://') || action.startsWith('https://')
      ? action
      : (_ORIGIN + (action.startsWith('/') ? '' : '/') + action);
    var params = new URLSearchParams(new FormData(form)).toString();
    e.preventDefault();
    window.location.href = toProxyUrl(abs + (params ? '?' + params : ''));
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
    // If it's an absolute URL and not already proxied, route it through the proxy
    if (typeof targetUrl === 'string' && targetUrl.startsWith('http') && targetUrl.indexOf('localhost:8000/api/scanner/proxy/') === -1) {{
      targetUrl = _PROXY + encodeURIComponent(targetUrl);
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
    if (typeof url === 'string' && url.startsWith('http') && url.indexOf(_PROXY) === -1) {{
      url = _PROXY + encodeURIComponent(url);
    }}
    return originalXHR.apply(this, [method, url].concat(rest));
  }};
}})();
</script>"""

    # Inject shim as early as possible — right after <head> or at the top
    if re.search(r"<head[^>]*>", html, re.IGNORECASE):
        html = re.sub(r"(<head[^>]*>)", r"\1" + nav_shim, html, count=1, flags=re.IGNORECASE)
    else:
        html = nav_shim + html

    return html


@api_view(['GET'])
@permission_classes([permissions.AllowAny])
def iframe_proxy(request):
    target_url = request.GET.get('url', '').strip()
    if not target_url:
        return HttpResponse("Missing URL", status=400)
    if not target_url.startswith(("http://", "https://")):
        return HttpResponse("Only http/https URLs are supported.", status=400)

    try:
        resp = requests.get(
            target_url,
            headers={
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,*/*;q=0.9',
                'Accept-Language': 'en-US,en;q=0.9',
            },
            timeout=15,
            allow_redirects=True,
        )
    except requests.exceptions.Timeout:
        return HttpResponse("Target URL timed out.", status=504)
    except requests.exceptions.RequestException as exc:
        return HttpResponse(f"Proxy fetch error: {exc}", status=502)

    content_type = resp.headers.get('Content-Type', 'application/octet-stream')

    _BLOCKED = {
        'x-frame-options', 'content-security-policy', 'content-security-policy-report-only',
        'strict-transport-security', 'transfer-encoding', 'content-encoding',
        'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
        'te', 'trailers', 'upgrade',
        # Prevent nosniff from blocking proxied JS/CSS with rewritten content-types
        'x-content-type-options',
        # Prevent referrer leaking the proxy URL to external servers
        'referrer-policy',
    }

    if 'text/html' in content_type:
        content = resp.content.decode('utf-8', errors='ignore')

        # Strip SRI integrity and crossorigin attrs — proxy rewrites URLs so hashes won't match
        content = re.sub(r'\s+integrity=["\'][^"\']*["\']', '', content, flags=re.IGNORECASE)
        content = re.sub(r'\s+crossorigin=["\'][^"\']*["\']', '', content, flags=re.IGNORECASE)

        # Rewrite all asset/link URLs to go back through this proxy
        content = _rewrite_html(content, target_url)

        proxy_response = HttpResponse(content, content_type='text/html; charset=utf-8')

    elif 'text/css' in content_type:
        # Rewrite url() and @import references inside CSS files
        content = resp.content.decode('utf-8', errors='ignore')

        def rewrite_css_ref(m):
            raw = m.group(1).strip().strip("'\"")
            if not raw or raw.startswith('data:'):
                return m.group(0)
            abs_url = raw if raw.startswith(('http://', 'https://')) else urljoin(target_url, raw)
            return f'url({_proxy_url(abs_url)})'

        content = re.sub(r'url\(\s*([^)]+)\s*\)', rewrite_css_ref, content, flags=re.IGNORECASE)

        # Rewrite @import "url" and @import url("url")
        def rewrite_import(m):
            raw = m.group(1).strip().strip("'\"")
            if raw.startswith('data:'):
                return m.group(0)
            abs_url = raw if raw.startswith(('http://', 'https://')) else urljoin(target_url, raw)
            return f'@import "{_proxy_url(abs_url)}"'

        content = re.sub(r'@import\s+(?:url\()?["\']?([^"\')\s]+)["\']?\)?', rewrite_import, content, flags=re.IGNORECASE)

        proxy_response = HttpResponse(content, content_type=content_type)
    else:
        proxy_response = HttpResponse(resp.content, content_type=content_type)

    for key, value in resp.headers.items():
        if key.lower() not in _BLOCKED:
            proxy_response[key] = value

    proxy_response['Access-Control-Allow-Origin'] = '*'
    proxy_response['Access-Control-Allow-Methods'] = 'GET, OPTIONS'
    # Explicitly allow framing and disable nosniff for proxied content
    proxy_response['X-Frame-Options'] = 'ALLOWALL'
    proxy_response['X-Content-Type-Options'] = ''
    proxy_response['Cache-Control'] = 'no-store'
    return proxy_response

