"""
Interaction handler — maps WebSocket event types to Playwright page actions.
Logic currently lives in BrowserSession._run command loop; extracted here for clarity.
"""
# Future: move tap/click/scroll/key/text/resize command handling from BrowserSession here.
