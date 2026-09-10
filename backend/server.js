require("dotenv").config();
const express = require("express");
const cors = require("cors");
const logger = require("./logger");
const db = require("./db");
const { register, metricsMiddleware } = require("./metrics");

const healthRouter = require("./routes/health");
const todosRouter = require("./routes/todos");
const simulateRouter = require("./routes/simulate");

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 3000;

// CORS configuration - robust handling for Kubernetes multi-service and ingress setups
const corsOptions = {
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "HEAD", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept", "Origin"],
  credentials: false,
};
app.use(cors(corsOptions));
app.options("*", cors(corsOptions)); // Explicitly respond to preflight OPTIONS checks

// Parse JSON request bodies
app.use(express.json());

// Apply metrics middleware to record request counts and duration
app.use(metricsMiddleware);

// Expose Prometheus metrics endpoint
app.get("/metrics", async (req, res) => {
  try {
    res.set("Content-Type", register.contentType);
    res.end(await register.metrics());
  } catch (err) {
    logger.error("Failed to generate metrics", { error: err.message });
    res.status(500).end(err.message);
  }
});

// Mount Routes
app.use(healthRouter);
app.use("/api/todos", todosRouter);
app.use("/simulate", simulateRouter);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Endpoint not found", path: req.originalUrl });
});

// Centralized error handler with structured JSON logging
app.use((err, req, res, next) => {
  logger.error("Unhandled error occurred in request", {
    path: req.originalUrl,
    method: req.method,
    error: err.message,
    stack: err.stack,
  });
  res.status(500).json({ error: "Internal server error" });
});

// Server startup
async function startServer() {
  await db.initDb();

  const server = app.listen(PORT, "0.0.0.0", () => {
    logger.info(`SentinelOpsAI Backend listening on port ${PORT}`, {
      port: PORT,
      nodeEnv: process.env.NODE_ENV || "development",
      enableTestRoutes: process.env.ENABLE_TEST_ROUTES === "true",
    });
  });

  // Graceful shutdown handling
  const shutdown = () => {
    logger.info("Gracefully shutting down backend server");
    server.close(() => {
      logger.info("HTTP server closed");
      process.exit(0);
    });
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

startServer();
