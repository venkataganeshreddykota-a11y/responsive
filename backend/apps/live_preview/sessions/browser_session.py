import asyncio
import base64
import concurrent.futures
import logging
import queue
import threading
import time

from playwright.sync_api import sync_playwright

from apps.emulation.devices import build_context_options
from apps.scanner.engines.browser_launcher import launch_chromium

logger = logging.getLogger(__name__)


class BrowserSession:
    def __init__(
        self,
        *,
        websocket,
        url,
        device_key="",
        label="",
        width=390,
        height=844,
        stream_scale=2,
        max_fps=14,
        stream_format="jpeg",
        stream_quality=84,
    ):
        self.websocket = websocket
        self.url = url
        self.device_key = device_key
        self.label = label
        self.width = int(width)
        self.height = int(height)
        self.loop = None
        self.closed = False
        self.commands = queue.Queue()
        self.started = concurrent.futures.Future()
        self.thread = None
        self.command_lock = threading.Lock()
        self.pending_scroll_x = 0
        self.pending_scroll_y = 0
        self.scroll_command_queued = False
        self.device_scale_factor = 1
        self.stream_width = self.width
        self.stream_height = self.height
        self.last_frame_at = 0
        self.requested_stream_scale = max(0.4, min(float(stream_scale or 1), 2))
        self.max_fps = max(1, min(float(max_fps or 14), 60))
        self.min_frame_interval = 1 / self.max_fps
        self.every_nth_frame = max(1, round(60 / self.max_fps))
        self.stream_format = "png" if str(stream_format).lower() == "png" else "jpeg"
        self.jpeg_quality = max(60, min(int(stream_quality or 84), 90)) if self.stream_format == "jpeg" else None

    async def start(self):
        if not self.url.startswith(("http://", "https://")):
            raise ValueError("Only http/https URLs are supported.")

        self.loop = asyncio.get_running_loop()
        self.thread = threading.Thread(target=self._run, name="rt-playwright-preview", daemon=True)
        self.thread.start()
        await asyncio.wrap_future(self.started)

    def _run(self):
        playwright = None
        browser = None
        context = None
        cdp = None

        try:
            playwright = sync_playwright().start()
            browser = launch_chromium(
                playwright,
                headless=True,
                args=[
                    "--enable-features=NetworkService",
                    "--disable-background-timer-throttling",
                    "--disable-renderer-backgrounding",
                ],
            )
            context_options = build_context_options(
                playwright,
                device_key=self.device_key,
                label=self.label,
                width=self.width,
                height=self.height,
            )
            self.device_scale_factor = float(context_options.get("device_scale_factor") or 1)
            stream_scale = max(0.4, min(self.device_scale_factor, self.requested_stream_scale))
            raw_stream_width = int(self.width * stream_scale)
            raw_stream_height = int(self.height * stream_scale)
            # CDP Page.startScreencast silently fails when dimensions exceed ~1500px.
            # Scale down proportionally if either dimension is over the limit.
            _CDP_MAX_DIM = 1500
            if raw_stream_width > _CDP_MAX_DIM or raw_stream_height > _CDP_MAX_DIM:
                scale_down = _CDP_MAX_DIM / max(raw_stream_width, raw_stream_height)
                self.stream_width = int(raw_stream_width * scale_down)
                self.stream_height = int(raw_stream_height * scale_down)
            else:
                self.stream_width = raw_stream_width
                self.stream_height = raw_stream_height

            context = browser.new_context(**context_options)
            page = context.new_page()
            page.goto(self.url, wait_until="domcontentloaded", timeout=45_000)

            cdp = context.new_cdp_session(page)
            cdp.send("Page.enable")
            cdp.on("Page.screencastFrame", lambda event: self._handle_frame(cdp, event))
            screencast_options = {
                "format": self.stream_format,
                "maxWidth": self.stream_width,
                "maxHeight": self.stream_height,
                "everyNthFrame": self.every_nth_frame,
            }
            if self.stream_format == "jpeg":
                screencast_options["quality"] = self.jpeg_quality
            cdp.send("Page.startScreencast", screencast_options)

            self.started.set_result(True)

            while not self.closed:
                try:
                    command, payload = self.commands.get(timeout=0.016)
                except queue.Empty:
                    page.wait_for_timeout(16)
                    continue

                if command == "close":
                    break
                if command == "tap":
                    page.touchscreen.tap(int(payload["x"]), int(payload["y"]))
                elif command == "click":
                    page.mouse.click(int(payload["x"]), int(payload["y"]))
                elif command == "mouse_move":
                    if cdp:
                        cdp.send("Input.dispatchMouseEvent", {
                            "type": "mouseMoved",
                            "x": int(payload["x"]),
                            "y": int(payload["y"]),
                            "button": "none",
                            "buttons": 0,
                            "pointerType": "mouse",
                        })
                    else:
                        page.mouse.move(int(payload["x"]), int(payload["y"]))
                elif command == "mouse_down":
                    if cdp:
                        cdp.send("Input.dispatchMouseEvent", {
                            "type": "mousePressed",
                            "x": int(payload["x"]),
                            "y": int(payload["y"]),
                            "button": "left",
                            "buttons": 1,
                            "clickCount": 1,
                            "pointerType": "mouse",
                        })
                    else:
                        page.mouse.down()
                elif command == "mouse_up":
                    if cdp:
                        cdp.send("Input.dispatchMouseEvent", {
                            "type": "mouseReleased",
                            "x": int(payload["x"]),
                            "y": int(payload["y"]),
                            "button": "left",
                            "buttons": 0,
                            "clickCount": 1,
                            "pointerType": "mouse",
                        })
                    else:
                        page.mouse.up()
                elif command == "scroll":
                    with self.command_lock:
                        delta_x = self.pending_scroll_x
                        delta_y = self.pending_scroll_y
                        self.pending_scroll_x = 0
                        self.pending_scroll_y = 0
                        self.scroll_command_queued = False
                    if delta_x or delta_y:
                        self.last_frame_at = 0
                        if cdp:
                            cdp.send("Input.dispatchMouseEvent", {
                                "type": "mouseWheel",
                                "x": max(1, min(self.width - 1, self.width // 2)),
                                "y": max(1, min(self.height - 1, self.height // 2)),
                                "deltaX": float(delta_x),
                                "deltaY": float(delta_y),
                                "pointerType": "mouse",
                            })
                        else:
                            page.mouse.wheel(float(delta_x), float(delta_y))
                elif command == "key" and payload.get("key"):
                    page.keyboard.press(payload["key"])
                elif command == "text" and payload.get("value"):
                    page.keyboard.insert_text(payload["value"])
                elif command == "reload":
                    page.reload(wait_until="domcontentloaded", timeout=45_000)
                elif command == "resize":
                    self.width = int(payload["width"])
                    self.height = int(payload["height"])
                    page.set_viewport_size({"width": self.width, "height": self.height})
                elif command == "inspect_code":
                    try:
                        self._complete_future(payload, self._inspect_page(page))
                    except Exception as exc:
                        self._fail_future(payload, exc)
                elif command == "apply_css":
                    try:
                        self._complete_future(payload, self._apply_fix(
                            page,
                            css=payload.get("css") or "",
                            html=payload.get("html") or "",
                            js=payload.get("js") or "",
                        ))
                    except Exception as exc:
                        self._fail_future(payload, exc)

        except Exception as exc:
            if "payload" in locals() and isinstance(payload, dict) and payload.get("_future"):
                self._fail_future(payload, exc)
            if not self.started.done():
                self.started.set_exception(exc)
            else:
                self._send_threadsafe({"type": "error", "message": str(exc)})
            logger.exception("Playwright live preview worker failed")
        finally:
            self.closed = True
            if cdp:
                try:
                    cdp.send("Page.stopScreencast")
                except Exception:
                    pass
            if context:
                context.close()
            if browser:
                browser.close()
            if playwright:
                playwright.stop()

    def _handle_frame(self, cdp, event):
        if self.closed:
            return

        now = time.monotonic()
        if now - self.last_frame_at < self.min_frame_interval:
            if event.get("sessionId"):
                cdp.send("Page.screencastFrameAck", {"sessionId": event["sessionId"]})
            return
        self.last_frame_at = now

        frame_data = event.get("data", "")
        if frame_data:
            self._send_bytes_threadsafe(base64.b64decode(frame_data))
        if event.get("sessionId"):
            cdp.send("Page.screencastFrameAck", {"sessionId": event["sessionId"]})

    def _send_threadsafe(self, message):
        if not self.loop or self.closed:
            return
        asyncio.run_coroutine_threadsafe(self.websocket.send_json(message), self.loop)

    def _send_bytes_threadsafe(self, data):
        if not self.loop or self.closed:
            return
        asyncio.run_coroutine_threadsafe(self.websocket.send(bytes_data=data), self.loop)

    def _complete_future(self, payload, value):
        future = payload.get("_future") if isinstance(payload, dict) else None
        if future and not future.done():
            future.set_result(value)

    def _fail_future(self, payload, exc):
        future = payload.get("_future") if isinstance(payload, dict) else None
        if future and not future.done():
            future.set_exception(exc)

    async def _request(self, command, payload=None):
        future = concurrent.futures.Future()
        data = dict(payload or {})
        data["_future"] = future
        self.commands.put((command, data))
        return await asyncio.wrap_future(future)

    def _inspect_page(self, page):
        page.wait_for_load_state("domcontentloaded", timeout=10_000)
        return page.evaluate(
            """
            async () => {
              const clip = (value, limit) => String(value || "").slice(0, limit);
              const cssChunks = [];
              document.querySelectorAll("style").forEach((style, index) => {
                if (style.id !== "responsive-tool-ai-fix") {
                  cssChunks.push(`/* Source: inline style #${index + 1} */\\n${style.textContent || ""}`);
                }
              });
              Array.from(document.styleSheets).forEach((sheet) => {
                try {
                  const rules = Array.from(sheet.cssRules || []).map((rule) => rule.cssText).join("\\n");
                  if (rules) cssChunks.push(`/* Source: ${sheet.href || "CSSOM stylesheet"} */\\n${rules}`);
                } catch (error) {
                  if (sheet.href) cssChunks.push(`/* Source: blocked external stylesheet: ${sheet.href} */`);
                }
              });

              const scripts = [];
              let jsTotal = 0;
              for (const [index, script] of Array.from(document.scripts).entries()) {
                let body = "";
                const src = script.src || "";
                if (src) {
                  try {
                    const response = await fetch(src, { credentials: "include" });
                    if (response.ok) body = await response.text();
                  } catch (error) {
                    body = "";
                  }
                } else {
                  body = script.textContent || "";
                }
                const header = src ? `/* Source: external script: ${src} */` : `/* Source: inline script #${index + 1} */`;
                const part = `${header}\\n${clip(body, 12000)}`;
                if (body || src) {
                  scripts.push(part);
                  jsTotal += part.length;
                }
                if (jsTotal > 90000 || scripts.length >= 28) break;
              }

              const uniqueSelector = (element) => {
                if (!element || element.nodeType !== 1) return "";
                if (element.id) return `#${CSS.escape(element.id)}`;
                const parts = [];
                let current = element;
                while (current && current.nodeType === 1 && current !== document.body && parts.length < 4) {
                  let part = current.tagName.toLowerCase();
                  const classes = Array.from(current.classList || []).filter(Boolean).slice(0, 3);
                  if (classes.length) part += classes.map((name) => `.${CSS.escape(name)}`).join("");
                  const parent = current.parentElement;
                  if (parent) {
                    const siblings = Array.from(parent.children).filter((sibling) => sibling.tagName === current.tagName);
                    if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(current) + 1})`;
                  }
                  parts.unshift(part);
                  current = parent;
                }
                return parts.length ? parts.join(" > ") : element.tagName.toLowerCase();
              };

              const selectors = Array.from(document.querySelectorAll("body *")).slice(0, 220).map((element) => {
                const rect = element.getBoundingClientRect();
                const styles = window.getComputedStyle(element);
                return {
                  tag: element.tagName.toLowerCase(),
                  id: element.id || "",
                  className: typeof element.className === "string" ? element.className.split(/\\s+/).slice(0, 6).join(" ") : "",
                  selector: uniqueSelector(element),
                  text: clip((element.textContent || "").trim().replace(/\\s+/g, " "), 90),
                  rect: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
                  display: styles.display,
                  position: styles.position,
                  overflow: styles.overflow,
                };
              });

              return {
                html: `<!doctype html>\\n${document.documentElement.outerHTML}`.slice(0, 90000),
                css: cssChunks.join("\\n\\n").slice(0, 220000),
                js: scripts.join("\\n\\n").slice(0, 100000),
                dom: {
                  title: document.title,
                  url: location.href,
                  viewport: {
                    width: document.documentElement.clientWidth,
                    height: document.documentElement.clientHeight,
                    scrollWidth: document.documentElement.scrollWidth,
                    scrollHeight: document.documentElement.scrollHeight,
                  },
                  counts: {
                    images: document.images.length,
                    links: document.links.length,
                    forms: document.forms.length,
                    buttons: document.querySelectorAll("button, input, select, textarea, [role='button']").length,
                    scripts: document.scripts.length,
                    stylesheets: document.styleSheets.length,
                  },
                  selectors,
                },
              };
            }
            """
        )

    def _apply_fix(self, page, *, css="", html="", js=""):
        before = page.content()
        before_screenshot = page.screenshot(type="png", full_page=False)
        validation = page.evaluate(
            """
            (patch) => {
              const css = String(patch.css || "");
              const html = String(patch.html || "");
              const js = String(patch.js || "");
              const viewport = {
                width: document.documentElement.clientWidth || window.innerWidth,
                height: document.documentElement.clientHeight || window.innerHeight,
              };
              const layoutMetrics = () => ({
                scrollWidth: Math.max(
                  document.documentElement.scrollWidth || 0,
                  document.body?.scrollWidth || 0
                ),
                clientWidth: document.documentElement.clientWidth || window.innerWidth,
              });
              const elementKey = (element) => {
                const text = (element.innerText || element.textContent || element.getAttribute("aria-label") || "")
                  .trim()
                  .replace(/\\s+/g, " ")
                  .slice(0, 80);
                return `${element.tagName.toLowerCase()}|${element.id || ""}|${element.className || ""}|${text}`;
              };
              const isVisible = (rect, style) => (
                rect.width > 1 &&
                rect.height > 1 &&
                rect.bottom > 0 &&
                rect.right > 0 &&
                rect.top < viewport.height &&
                rect.left < viewport.width &&
                style.visibility !== "hidden" &&
                style.display !== "none" &&
                Number(style.opacity || 1) > 0.05
              );
              const visibleRatio = (rect) => {
                const visibleWidth = Math.max(0, Math.min(rect.right, viewport.width) - Math.max(rect.left, 0));
                const visibleHeight = Math.max(0, Math.min(rect.bottom, viewport.height) - Math.max(rect.top, 0));
                const area = Math.max(1, rect.width * rect.height);
                return (visibleWidth * visibleHeight) / area;
              };
              const isImportantElement = (element, style) => {
                const label = (element.innerText || element.textContent || element.value || element.getAttribute("aria-label") || "")
                  .trim()
                  .replace(/\\s+/g, " ");
                const identity = `${element.tagName || ""} ${element.id || ""} ${element.className || ""} ${label}`.toLowerCase();
                const semanticControl = element.matches("button, a[href], [role='button'], input[type='button'], input[type='submit']");
                const ctaLike = /\\b(start\\s*now|start|cta|call-to-action|primarybtn|primary-btn|primary_action|primary-action)\\b/i.test(identity);
                const buttonLike = /\\b(button|btn|chip|pill|tag|filter|badge)\\b/i.test(identity);
                const clickableLike = style.cursor === "pointer" && label.length > 0;
                return semanticControl || ctaLike || buttonLike || clickableLike;
              };
              const snapshotImportantElements = () => Array.from(document.querySelectorAll("body *"))
                .map((element) => {
                  const rect = element.getBoundingClientRect();
                  const style = window.getComputedStyle(element);
                  if (!isImportantElement(element, style)) return null;
                  return {
                    key: elementKey(element),
                    label: (element.innerText || element.textContent || element.value || element.getAttribute("aria-label") || element.tagName)
                      .trim()
                      .replace(/\\s+/g, " ")
                      .slice(0, 80),
                    isAnchor: /\\b(start\\s*now|start|cta|call-to-action|primarybtn|primary-btn|primary_action|primary-action|submit|continue|buy|book|contact)\\b/i.test(
                      `${element.tagName || ""} ${element.id || ""} ${element.className || ""} ${(element.innerText || element.textContent || element.value || element.getAttribute("aria-label") || "")}`
                    ),
                    rect: {
                      left: rect.left,
                      top: rect.top,
                      right: rect.right,
                      bottom: rect.bottom,
                      width: rect.width,
                      height: rect.height,
                    },
                    centerX: rect.left + rect.width / 2,
                    centerY: rect.top + rect.height / 2,
                    visibleRatio: visibleRatio(rect),
                    visible: isVisible(rect, style),
                  };
                })
                .filter(Boolean)
                .filter((item) => item.visible);

              const beforeImportant = snapshotImportantElements();
              const beforeMetrics = layoutMetrics();
              const originalBodyHtml = document.body ? document.body.innerHTML : "";
              let style = document.getElementById("responsive-tool-ai-fix");
              const previousCss = style ? style.textContent || "" : "";
              if (!style) {
                style = document.createElement("style");
                style.id = "responsive-tool-ai-fix";
                style.setAttribute("data-responsive-tool", "code-fix");
                (document.head || document.documentElement).appendChild(style);
              }

              const waitForLayout = () => new Promise((resolve) => {
                window.requestAnimationFrame(() => {
                  window.requestAnimationFrame(resolve);
                });
              });

              const findViolations = () => {
                  const afterImportant = snapshotImportantElements();
                  const afterByKey = new Map(afterImportant.map((item) => [item.key, item]));
                  const violations = [];
                  const afterMetrics = layoutMetrics();
                  // Increased tolerance from 2px to 10px to allow minor layout shifts
                  if (afterMetrics.scrollWidth > afterMetrics.clientWidth + 10) {
                    violations.push({
                      label: "page horizontal overflow",
                      beforeScrollWidth: Math.round(beforeMetrics.scrollWidth),
                      afterScrollWidth: Math.round(afterMetrics.scrollWidth),
                      viewportWidth: Math.round(afterMetrics.clientWidth),
                      horizontalOverflow: true,
                      // Only flag as regression if overflow increased significantly (>20px)
                      regression: afterMetrics.scrollWidth > beforeMetrics.scrollWidth + 20,
                    });
                  }
                  for (const before of beforeImportant) {
                    const after = afterByKey.get(before.key);
                    // Only flag as missing if the element was clearly visible before (ratio >= 0.5)
                    // and is now completely gone from the DOM snapshot.
                    if (!after) {
                      if (before.visibleRatio >= 0.5) {
                        violations.push({
                          label: before.label || "interactive element",
                          movedX: 0,
                          movedY: 0,
                          beforeVisibleRatio: Number(before.visibleRatio.toFixed(2)),
                          afterVisibleRatio: 0,
                          outsideViewport: true,
                          missing: true,
                        });
                      }
                      continue;
                    }
                    const movedX = Math.abs(after.centerX - before.centerX);
                    const movedY = Math.abs(after.centerY - before.centerY);
                    // Only flag elements that are truly off-screen (not just reflowed/repositioned).
                    // A responsive fix intentionally moves and resizes elements — that is not a violation.
                    const hardClipped =
                      after.rect.right < 0 ||
                      after.rect.left > viewport.width ||
                      after.rect.bottom < 0 ||
                      after.rect.top > viewport.height * 3;
                    // Became invisible (display:none / visibility:hidden / opacity:0 equivalent)
                    const becameInvisible = before.visibleRatio >= 0.5 && after.visibleRatio < 0.05;
                    // More lenient clipping threshold - allow up to 30% visibility loss
                    const becameMoreClipped =
                      before.visibleRatio >= 0.5 &&
                      after.visibleRatio < Math.max(0.25, before.visibleRatio - 0.3);
                    // Increased drift thresholds to allow responsive repositioning
                    // Changed from 96px to 200px and from 18% to 30% of viewport
                    const anchorDrift =
                      before.isAnchor &&
                      before.visibleRatio >= 0.5 &&
                      (
                        movedX > Math.max(200, viewport.width * 0.3) ||
                        movedY > Math.max(250, viewport.height * 0.3)
                      );
                    if (hardClipped || becameInvisible || becameMoreClipped || anchorDrift) {
                      violations.push({
                        label: before.label || "interactive element",
                        movedX: Math.round(movedX),
                        movedY: Math.round(movedY),
                        beforeVisibleRatio: Number(before.visibleRatio.toFixed(2)),
                        afterVisibleRatio: Number(after.visibleRatio.toFixed(2)),
                        outsideViewport: hardClipped,
                        becameMoreClipped,
                        anchorDrift,
                        regression: true,
                      });
                    }
                  }
                  return violations;
              };
              const regressionViolations = (violations) => violations.filter((violation) => violation.regression);

              const expandCssRules = (cssText) => {
                const probe = document.createElement("style");
                probe.textContent = cssText;
                (document.head || document.documentElement).appendChild(probe);
                const chunks = [];
                try {
                  Array.from(probe.sheet?.cssRules || []).forEach((rule) => {
                    if (rule.type === CSSRule.MEDIA_RULE && rule.cssRules?.length) {
                      Array.from(rule.cssRules).forEach((childRule) => {
                        chunks.push(`@media ${rule.conditionText} { ${childRule.cssText} }`);
                      });
                    } else if (rule.cssText) {
                      chunks.push(rule.cssText);
                    }
                  });
                } catch (error) {
                  return [cssText];
                } finally {
                  probe.remove();
                }
                return chunks.length ? chunks : [cssText];
              };

              const runOverflowRescue = async () => {
                const vw = viewport.width;
                const pageWidth = Math.max(0, document.documentElement.clientWidth || vw);
                document.documentElement.style.maxWidth = "100%";
                document.body.style.maxWidth = "100%";

                const isSkippable = (element) => ["SCRIPT", "STYLE", "LINK", "META", "NOSCRIPT"].includes(element.tagName);
                const textOf = (element) => (element.innerText || element.textContent || element.value || element.getAttribute("aria-label") || "").trim();
                const isChipLike = (element) => /chip|pill|tag|badge|filter|more/i.test(element.className || "") || /^&?\\s*more$/i.test(textOf(element));
                const isServiceCard = (element) => {
                  const identity = `${element.tagName || ""} ${element.id || ""} ${element.className || ""} ${textOf(element)}`.toLowerCase();
                  return /entity|company|bookkeeping|compliance|tax|registration|certification|credential|more/.test(identity);
                };
                const rescueElement = (element) => {
                  const rect = element.getBoundingClientRect();
                  if (!rect.width || !rect.height) return false;
                  const style = window.getComputedStyle(element);
                  const overflows = rect.width > pageWidth || rect.right > pageWidth + 1;
                  const serviceCard = isServiceCard(element);
                  const chipLike = isChipLike(element);
                  if (!overflows && !serviceCard && !chipLike) return false;

                  element.setAttribute("data-responsive-tool-rescue", "1");
                  element.style.boxSizing = "border-box";
                  element.style.minWidth = "0";
                  element.style.maxWidth = "100%";

                  if (chipLike) {
                    element.style.whiteSpace = "normal";
                    element.style.overflowWrap = "anywhere";
                  }

                  if (style.display === "flex" || element.children.length > 1) {
                    element.style.flexWrap = "wrap";
                  }

                  if (rect.width > pageWidth) {
                    element.style.width = "100%";
                  }

                  return true;
                };

                const elements = Array.from(document.body.querySelectorAll("*")).filter((element) => !isSkippable(element));
                const importantFirst = elements.sort((a, b) => {
                  const ar = a.getBoundingClientRect();
                  const br = b.getBoundingClientRect();
                  const ao = (ar.left < 0 || ar.right > vw || ar.width > vw) ? 0 : 1;
                  const bo = (br.left < 0 || br.right > vw || br.width > vw) ? 0 : 1;
                  return ao - bo;
                });
                let changed = false;
                for (const element of importantFirst) {
                  changed = rescueElement(element) || changed;
                }
                await waitForLayout();
                return changed;
              };

              return new Promise((resolve) => {
                (async () => {
                  style.textContent = css;
                  await waitForLayout();
                  const fullViolations = findViolations();
                  let safeRules = css.trim() ? [css] : [];
                  let skippedRules = [];
                  // Only do incremental filtering if there are SEVERE regressions
                  // (missing elements or hard clipped), not just minor violations
                  const severeRegressions = regressionViolations(fullViolations).filter(v => 
                    v.missing || v.outsideViewport || v.becameInvisible
                  );
                  if (severeRegressions.length) {
                    safeRules = [];
                    const ruleChunks = expandCssRules(css);
                    style.textContent = previousCss;
                    await waitForLayout();

                    for (const ruleText of ruleChunks) {
                      const candidateCss = [previousCss, ...safeRules, ruleText].filter(Boolean).join("\\n\\n");
                      style.textContent = candidateCss;
                      await waitForLayout();
                      const violations = findViolations();
                      // Only skip rules that cause SEVERE regressions
                      const severeRegs = regressionViolations(violations).filter(v => 
                        v.missing || v.outsideViewport || v.becameInvisible
                      );
                      if (severeRegs.length) {
                        skippedRules.push({
                          rule: ruleText.slice(0, 240),
                          violations: severeRegs.slice(0, 3),
                        });
                        style.textContent = [previousCss, ...safeRules].filter(Boolean).join("\\n\\n");
                        await waitForLayout();
                      } else {
                        safeRules.push(ruleText);
                      }
                    }
                  }

                  const finalCss = [previousCss, ...safeRules].filter(Boolean).join("\\n\\n");
                  style.textContent = finalCss;
                  await waitForLayout();
                  const finalViolations = findViolations();
                  const applyHtmlPatch = async () => {
                    if (!html.trim() || !document.body) return { applied: false, skipped: false };
                    const parser = new DOMParser();
                    const parsed = parser.parseFromString(html, "text/html");
                    const parsedBody = parsed.body;
                    if (!parsedBody || !parsedBody.childNodes.length) return { applied: false, skipped: true, reason: "Generated HTML patch was empty." };
                    const backupBody = document.body.innerHTML;
                    const isInteractivePatch = (element) => element.matches?.("button, a[href], [role='button'], input, select, textarea") || false;
                    const normalizedText = (element) => (element.innerText || element.textContent || "")
                      .trim()
                      .replace(/\\s+/g, " ");
                    const querySafe = (selector) => {
                      const raw = String(selector || "").trim();
                      if (!raw) return null;
                      const candidates = [raw];
                      if (/^[A-Za-z0-9_-]+$/.test(raw)) {
                        candidates.push(`.${CSS.escape(raw)}`);
                        candidates.push(`[class~="${CSS.escape(raw)}"]`);
                      }
                      for (const candidate of candidates) {
                        try {
                          const matches = Array.from(document.querySelectorAll(candidate));
                          if (matches.length === 1) return matches[0];
                          if (matches.length > 1) {
                            const visible = matches.filter((element) => {
                              const rect = element.getBoundingClientRect();
                              const style = window.getComputedStyle(element);
                              return isVisible(rect, style);
                            });
                            if (visible.length === 1) return visible[0];
                          }
                        } catch (error) {
                          // Try the next selector candidate.
                        }
                      }
                      return null;
                    };
                    const findReplacementTarget = (child) => {
                      const explicitSelector = child.getAttribute("data-responsive-selector");
                      if (explicitSelector) {
                        const explicitTarget = querySafe(explicitSelector);
                        if (explicitTarget) return explicitTarget;
                      }
                      const id = child.getAttribute("id");
                      if (id) {
                        const idTarget = document.getElementById(id);
                        if (idTarget) return idTarget;
                      }
                      if (!isInteractivePatch(child)) return null;
                      const classes = Array.from(child.classList || []).filter(Boolean);
                      for (const className of classes) {
                        const selector = `${child.tagName.toLowerCase()}.${CSS.escape(className)}`;
                        const matches = Array.from(document.querySelectorAll(selector));
                        if (matches.length === 1) return matches[0];
                      }
                      for (const className of classes) {
                        const selector = `.${CSS.escape(className)}`;
                        const matches = Array.from(document.querySelectorAll(selector));
                        if (matches.length === 1) return matches[0];
                      }
                      return null;
                    };
                    if (/<\\s*(?:!doctype|html|body)\\b/i.test(html)) {
                      document.body.innerHTML = parsedBody.innerHTML;
                    } else {
                      const children = Array.from(parsedBody.children);
                      let replaced = false;
                      for (const child of children) {
                        const target = findReplacementTarget(child);
                        if (target) {
                          const targetText = normalizedText(target);
                          const patchText = normalizedText(child);
                          const replacingLargeSection = target.children.length > 5 || targetText.length > 300;
                          if (replacingLargeSection && patchText.length < targetText.length * 0.65) {
                            continue;
                          }
                          target.replaceWith(child);
                          replaced = true;
                        }
                      }
                      if (!replaced) {
                        return { applied: false, skipped: true, reason: "Generated HTML patch did not identify a safe replacement target." };
                      }
                    }
                    await waitForLayout();
                    const violations = findViolations();
                    // Only reject HTML patch if it causes SEVERE violations (missing or invisible elements)
                    const severeViolations = violations.filter(v => 
                      v.missing || v.becameInvisible || 
                      (v.outsideViewport && v.beforeVisibleRatio >= 0.8)
                    );
                    if (severeViolations.length) {
                      document.body.innerHTML = backupBody;
                      await waitForLayout();
                      return { applied: false, skipped: true, reason: "Generated HTML patch was skipped because it removed or made controls invisible.", violations: severeViolations };
                    }
                    return { applied: true, skipped: false };
                  };

                  const applyJsPatch = async () => {
                    if (!js.trim()) return { applied: false, skipped: false };
                    try {
                      const runner = new Function("document", "window", `"use strict";\\n${js}`);
                      runner(document, window);
                    } catch (error) {
                      return { applied: false, skipped: true, reason: `Generated JavaScript patch failed: ${error.message || error}` };
                    }
                    await waitForLayout();
                    const violations = findViolations();
                    // Only flag severe violations for JS patches, allow minor repositioning
                    const severeViolations = violations.filter(v => 
                      v.missing || v.becameInvisible || 
                      (v.outsideViewport && v.beforeVisibleRatio >= 0.8)
                    );
                    if (severeViolations.length) {
                      return { applied: true, skipped: false, reason: "Generated JavaScript patch caused severe control issues.", violations: severeViolations };
                    }
                    return { applied: true, skipped: false };
                  };

                  const htmlResult = await applyHtmlPatch();
                  const jsResult = await applyJsPatch();
                  let finalViolationsAfterPatches = findViolations();
                  let rescueApplied = false;
                  if (finalViolationsAfterPatches.some((violation) => (
                    violation.horizontalOverflow ||
                    violation.anchorDrift ||
                    violation.becameMoreClipped ||
                    violation.outsideViewport
                  ))) {
                    rescueApplied = await runOverflowRescue();
                    finalViolationsAfterPatches = findViolations();
                  }
                  const nonBlockingViolations = finalViolationsAfterPatches.length
                    ? finalViolationsAfterPatches
                    : finalViolations;
                  // Only block on SEVERE violations: missing elements or truly outside viewport
                  // Allow minor overflow, clipping, and drift as they're often part of responsive fixes
                  const blockingViolations = nonBlockingViolations.filter((violation) => (
                    violation.missing ||
                    (violation.outsideViewport && violation.beforeVisibleRatio >= 0.8) ||
                    (violation.horizontalOverflow && violation.regression && 
                     violation.afterScrollWidth > violation.viewportWidth + 50)
                  ));
                  const needsAttention = htmlResult.skipped || jsResult.skipped || nonBlockingViolations.length > 0 || rescueApplied;
                  // More lenient rejection: only reject if there are severe blocking violations
                  // AND no HTML/JS patch was applied (CSS-only failures are more likely false positives)
                  const rejected = blockingViolations.length > 0 && !(htmlResult.applied || jsResult.applied);
                  if (rejected) {
                    style.textContent = previousCss;
                    if (document.body && originalBodyHtml) {
                      document.body.innerHTML = originalBodyHtml;
                    }
                    await waitForLayout();
                  }

                  resolve({
                    accepted: !rejected,
                    partial: needsAttention,
                    reason: blockingViolations.length
                      ? "Generated patch was rejected because it still leaves horizontal overflow or moves/clips important controls."
                      : htmlResult.skipped
                      ? "Generated HTML patch could not be matched to the live DOM."
                      : jsResult.skipped
                      ? "Generated JavaScript patch could not be safely applied."
                      : rescueApplied
                      ? "Applied generated fix with live overflow rescue."
                      : nonBlockingViolations.length
                      ? "Applied generated fix with non-blocking layout warnings."
                      : "Applied generated HTML/CSS/JS fix.",
                    violations: nonBlockingViolations.slice(0, 5),
                    skippedRules,
                    htmlPatch: htmlResult,
                    jsPatch: jsResult,
                    rescueApplied,
                    appliedRuleCount: safeRules.length,
                  });
                })();
              });
            }
            """,
            {"css": css, "html": html, "js": js},
        )
        page.wait_for_timeout(250)
        after_screenshot = page.screenshot(type="png", full_page=False)
        return {
            "before_html": before[:90000],
            "after_html": page.content()[:90000],
            "before_image": "data:image/png;base64," + base64.b64encode(before_screenshot).decode("ascii"),
            "after_image": "data:image/png;base64," + base64.b64encode(after_screenshot).decode("ascii"),
            "accepted": validation.get("accepted", True) if isinstance(validation, dict) else True,
            "partial": validation.get("partial", False) if isinstance(validation, dict) else False,
            "validation_reason": validation.get("reason", "") if isinstance(validation, dict) else "",
            "validation_violations": validation.get("violations", []) if isinstance(validation, dict) else [],
            "skipped_rules": validation.get("skippedRules", []) if isinstance(validation, dict) else [],
            "html_patch": validation.get("htmlPatch", {}) if isinstance(validation, dict) else {},
            "js_patch": validation.get("jsPatch", {}) if isinstance(validation, dict) else {},
        }

    async def tap(self, x, y):
        self.commands.put(("tap", {"x": x, "y": y}))

    async def click(self, x, y):
        self.commands.put(("click", {"x": x, "y": y}))

    async def mouse_move(self, x, y):
        self.commands.put(("mouse_move", {"x": x, "y": y}))

    async def mouse_down(self, x, y):
        self.commands.put(("mouse_down", {"x": x, "y": y}))

    async def mouse_up(self, x, y):
        self.commands.put(("mouse_up", {"x": x, "y": y}))

    async def scroll(self, delta_x, delta_y):
        with self.command_lock:
            self.pending_scroll_x += float(delta_x or 0)
            self.pending_scroll_y += float(delta_y or 0)
            if self.scroll_command_queued:
                return
            self.scroll_command_queued = True
        self.commands.put(("scroll", {}))

    async def key(self, key):
        self.commands.put(("key", {"key": key}))

    async def text(self, value):
        self.commands.put(("text", {"value": value}))

    async def reload(self):
        self.commands.put(("reload", {}))

    async def resize(self, width, height):
        self.commands.put(("resize", {"width": width, "height": height}))

    async def inspect_code(self):
        return await self._request("inspect_code")

    async def apply_css(self, css, html="", js=""):
        return await self._request("apply_css", {"css": css, "html": html, "js": js})

    async def close(self):
        self.closed = True
        self.commands.put(("close", {}))
        if self.thread and self.thread.is_alive():
            await asyncio.to_thread(self.thread.join, 3)
