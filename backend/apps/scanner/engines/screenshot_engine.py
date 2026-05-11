"""
Screenshot engine — thin wrapper around playwright_engine.render_device_screenshot.
Provides a dedicated import path for screenshot-only operations.
"""
from .playwright_engine import render_device_screenshot

__all__ = ["render_device_screenshot"]
