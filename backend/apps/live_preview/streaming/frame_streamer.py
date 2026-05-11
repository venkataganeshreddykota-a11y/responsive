"""
Frame streamer — handles CDP screencast frame delivery over WebSocket.
Logic currently lives in BrowserSession._handle_frame; extracted here for clarity.
"""
# Future: move _handle_frame and _send_bytes_threadsafe from BrowserSession here.
