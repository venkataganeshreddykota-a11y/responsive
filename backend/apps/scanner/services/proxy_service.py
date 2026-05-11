"""
Proxy service — re-exports the proxy helpers defined in views.py.
Heavy proxy logic lives in views.py for now; this module provides
a clean import path for future extraction.
"""
# Proxy logic is currently co-located with views.
# To refactor: move _rewrite_html, _proxy_url, iframe_proxy here.
