const { createProxyMiddleware } = require("http-proxy-middleware");

// Prevent unhandled stream errors from killing the dev server process.
// This is a Node v24 + http-proxy-middleware streaming incompatibility.
process.on("uncaughtException", (err) => {
  if (
    err.code === "ERR_STREAM_WRITE_AFTER_END" ||
    err.code === "HPE_INVALID_CONSTANT" ||
    (err.message && err.message.includes("write after end"))
  ) {
    return; // swallow silently
  }
  console.error("Uncaught exception:", err);
});

module.exports = function (app) {
  app.use(
    "/rt-ws",
    createProxyMiddleware({
      target: "ws://localhost:8000",
      changeOrigin: true,
      ws: true,
    })
  );

  app.use(
    "/api",
    createProxyMiddleware({
      target: "http://localhost:8000",
      changeOrigin: true,
      on: {
        error(err, req, res) {
          try {
            if (!res.headersSent) {
              res.writeHead(502, { "Content-Type": "text/plain" });
            }
            res.end("Proxy error: " + err.message);
          } catch (_) {
            // ignore secondary write errors
          }
        },
      },
    })
  );
};

