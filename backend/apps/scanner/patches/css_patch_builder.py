"""
CSS patch builder — re-exports build_css_patch from responsive_patches.
Provides a dedicated import path for patch generation.
"""
from .responsive_patches import build_css_patch, detect_rendered_issues

__all__ = ["build_css_patch", "detect_rendered_issues"]
