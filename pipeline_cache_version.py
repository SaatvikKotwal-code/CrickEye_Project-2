"""
Single source of truth for Supabase replay-cache invalidation.

Bump ANALYSIS_CACHE_VERSION when you change analyse_session.py outputs, WS shot
payloads, or anything stored in session results that should force a re-run for
the same video bytes.
"""

# Integer; must match what the frontend compares against (from GET /api/public-config).
ANALYSIS_CACHE_VERSION = 7
