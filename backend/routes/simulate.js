const express = require("express");
const router = express.Router();
const logger = require("../logger");

// Global array holding memory buffers to prevent garbage collection
const leakedMemoryBuffers = [];

// Middleware to gate simulation routes behind ENABLE_TEST_ROUTES=true
function verifyTestRoutesEnabled(req, res, next) {
  if (process.env.ENABLE_TEST_ROUTES !== "true") {
    logger.warn("Attempt to access simulation route while ENABLE_TEST_ROUTES is false", {
      route: req.originalUrl,
    });
    return res.status(403).json({
      error: "Simulation routes are disabled. Set ENABLE_TEST_ROUTES=true to enable.",
    });
  }
  next();
}

router.use(verifyTestRoutesEnabled);

// GET /simulate/leak
// Allocates ~20MB buffer and retains it in memory.
// In K8s with 200Mi limit, calling this ~8-10 times pushes working set beyond 90% (~188Mi) and triggers OOMKilled.
router.get("/leak", (req, res) => {
  const sizeMB = parseInt(req.query.mb, 10) || 20;
  const bytes = sizeMB * 1024 * 1024;

  // Allocate buffer filled with pseudo-random bytes so the OS cannot optimize/page it away
  const buffer = Buffer.alloc(bytes, Math.floor(Math.random() * 256));
  leakedMemoryBuffers.push(buffer);

  const memUsage = process.memoryUsage();
  const totalLeakedMB = leakedMemoryBuffers.reduce((sum, b) => sum + b.length, 0) / (1024 * 1024);

  logger.warn("Simulated memory leak triggered", {
    allocatedMB: sizeMB,
    totalLeakedMB: Math.round(totalLeakedMB * 10) / 10,
    rssMB: Math.round((memUsage.rss / (1024 * 1024)) * 10) / 10,
    heapUsedMB: Math.round((memUsage.heapUsed / (1024 * 1024)) * 10) / 10,
    chunksCount: leakedMemoryBuffers.length,
  });

  res.json({
    status: "leaked",
    message: `Allocated ${sizeMB} MB into global retention pool`,
    totalLeakedMB: Math.round(totalLeakedMB * 10) / 10,
    rssMB: Math.round((memUsage.rss / (1024 * 1024)) * 10) / 10,
    chunksCount: leakedMemoryBuffers.length,
    tip: "In Kubernetes, repeat until memory reaches 200Mi limit to trigger OOMKilled",
  });
});

// GET /simulate/slow
// Simulates an artificial delay of 3 seconds (or custom ms)
router.get("/slow", async (req, res) => {
  const delayMs = parseInt(req.query.ms, 10) || 3000;
  logger.warn("Simulated slow request initiated", { delayMs });

  const start = Date.now();
  await new Promise((resolve) => setTimeout(resolve, delayMs));
  const elapsed = Date.now() - start;

  logger.warn("Simulated slow request completed", { elapsedMs: elapsed });
  res.json({
    status: "slow_completed",
    message: `Responded after artificial delay of ${elapsed} ms`,
    elapsedMs: elapsed,
    tip: "Check Grafana p95 latency panel or Prometheus http_request_duration_seconds",
  });
});

// GET /simulate/crash
// Intentionally terminates the Node.js process to simulate a container crash
router.get("/crash", (req, res) => {
  logger.error("Simulated crash requested: process will terminate in 250ms", {
    route: "/simulate/crash",
  });

  res.status(500).json({
    status: "crashing",
    message: "Process termination initiated. The container will exit with code 1.",
    tip: "Kubernetes will trigger container restart and increment restart count.",
  });

  setTimeout(() => {
    process.exit(1);
  }, 250);
});

// GET /simulate/status - View current simulation state
router.get("/status", (req, res) => {
  const memUsage = process.memoryUsage();
  const totalLeakedMB = leakedMemoryBuffers.reduce((sum, b) => sum + b.length, 0) / (1024 * 1024);

  res.json({
    enabled: true,
    totalLeakedMB: Math.round(totalLeakedMB * 10) / 10,
    chunksCount: leakedMemoryBuffers.length,
    rssMB: Math.round((memUsage.rss / (1024 * 1024)) * 10) / 10,
    heapUsedMB: Math.round((memUsage.heapUsed / (1024 * 1024)) * 10) / 10,
  });
});

module.exports = router;
