// Centralized structured JSON logger for SentinelOpsAI backend
// Produces: { level, msg, service: "backend", timestamp, ...extra }
// Compatible with Promtail JSON parsing in Loki

function log(level, msg, extra = {}) {
  const payload = {
    level,
    msg,
    service: "backend",
    timestamp: new Date().toISOString(),
    ...extra,
  };
  // Use stdout for info/warn and stderr for error
  if (level === "error") {
    process.stderr.write(JSON.stringify(payload) + "\n");
  } else {
    process.stdout.write(JSON.stringify(payload) + "\n");
  }
}

module.exports = {
  info: (msg, extra) => log("info", msg, extra),
  warn: (msg, extra) => log("warn", msg, extra),
  error: (msg, extra) => log("error", msg, extra),
  log,
};
