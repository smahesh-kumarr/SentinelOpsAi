const client = require("prom-client");

// Dedicated registry to isolate application metrics
const register = new client.Registry();

// Enable default runtime and OS metrics (CPU, memory, event loop, GC)
client.collectDefaultMetrics({ register });

// Counter for total HTTP requests partitioned by method, route, and status code
const httpRequestCounter = new client.Counter({
  name: "http_requests_total",
  help: "Total HTTP requests processed by the backend",
  labelNames: ["method", "route", "status_code"],
  registers: [register],
});

// Histogram for tracking latency distributions
const httpRequestDuration = new client.Histogram({
  name: "http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "route", "status_code"],
  buckets: [0.05, 0.1, 0.3, 0.5, 1, 2, 5],
  registers: [register],
});

// Express middleware to measure every incoming request
function metricsMiddleware(req, res, next) {
  // Avoid instrumenting /metrics itself to prevent metric recursion
  if (req.path === "/metrics") {
    return next();
  }

  const start = process.hrtime();

  res.on("finish", () => {
    const diff = process.hrtime(start);
    const durationInSeconds = diff[0] + diff[1] / 1e9;

    // Normalize route label to prevent high cardinality (e.g. /api/todos/1 -> /api/todos/:id)
    const route = req.baseUrl ? `${req.baseUrl}${req.route ? req.route.path : ""}` : req.route ? req.route.path : req.path;

    const labels = {
      method: req.method,
      route: route || req.path,
      status_code: res.statusCode.toString(),
    };

    httpRequestCounter.inc(labels);
    httpRequestDuration.observe(labels, durationInSeconds);
  });

  next();
}

module.exports = {
  register,
  httpRequestCounter,
  httpRequestDuration,
  metricsMiddleware,
};
