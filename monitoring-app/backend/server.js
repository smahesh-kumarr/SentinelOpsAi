// ==============================================================================
// SentinelOpsAI — SRE Observability & Remediation API Gateway Backend
// ==============================================================================
// Aggregates Correlation Engine, AI RCA Service, Remediation Agent & Collector
// Runs on Port 3002

const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const client = require("prom-client");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3002;

// Microservice URLs (configurable via environment variables)
const CORRELATION_URL = process.env.CORRELATION_URL || "http://correlation-engine.sentinelopsai.svc.cluster.local:8001";
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://ai-service.sentinelopsai.svc.cluster.local:8002";
const AI_AGENT_URL = process.env.AI_AGENT_URL || "http://ai-agent.sentinelopsai.svc.cluster.local:8003";
const COLLECTOR_URL = process.env.COLLECTOR_URL || "http://collector-service.sentinelopsai.svc.cluster.local:8000";
const WORKLOAD_URL = process.env.WORKLOAD_URL || "http://backend.sentinelopsai.svc.cluster.local:3000";

// Fallback hostnames for local development/port-forwards
const LOCAL_CORRELATION = "http://localhost:8001";
const LOCAL_AI = "http://localhost:8002";
const LOCAL_AGENT = "http://localhost:8003";
const LOCAL_COLLECTOR = "http://localhost:8000";
const LOCAL_WORKLOAD = "http://localhost:3000";

// Helper for resilient fetch with fallback to localhost
async function safeFetch(primaryUrl, localFallbackUrl, path, options = {}) {
  const timeoutMs = options.timeout || 5000;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  const fetchOptions = {
    ...options,
    signal: controller.signal,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  };

  try {
    const res = await fetch(`${primaryUrl}${path}`, fetchOptions);
    clearTimeout(id);
    return res;
  } catch (errPrimary) {
    clearTimeout(id);
    // If running outside cluster, attempt local port fallback
    try {
      const resLocal = await fetch(`${localFallbackUrl}${path}`, fetchOptions);
      return resLocal;
    } catch {
      throw errPrimary;
    }
  }
}

// Prometheus metrics
const register = new client.Registry();
client.collectDefaultMetrics({ register });

const httpRequestCounter = new client.Counter({
  name: "monitoring_gateway_requests_total",
  help: "Total requests handled by Monitoring Gateway",
  labelNames: ["method", "route", "status_code"],
  registers: [register],
});

// Middleware
app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    httpRequestCounter.inc({
      method: req.method,
      route: req.route?.path || req.path,
      status_code: res.statusCode,
    });
  });
  next();
});

// ------------------------------------------------------------------------------
// Health & Prometheus Metrics
// ------------------------------------------------------------------------------

app.get("/health", async (req, res) => {
  res.json({
    status: "ok",
    service: "monitoring-backend",
    port: PORT,
    timestamp: new Date().toISOString(),
    endpoints: {
      correlation: CORRELATION_URL,
      aiService: AI_SERVICE_URL,
      aiAgent: AI_AGENT_URL,
      collector: COLLECTOR_URL,
      workload: WORKLOAD_URL,
    },
  });
});

app.get("/metrics", async (req, res) => {
  res.set("Content-Type", register.contentType);
  res.end(await register.metrics());
});

// ------------------------------------------------------------------------------
// 1. Incidents & AI RCA APIs
// ------------------------------------------------------------------------------

// Fetch analyzed incidents from AI service
app.get("/api/incidents/analyzed", async (req, res) => {
  const limit = req.query.limit || 50;
  try {
    const upstream = await safeFetch(AI_SERVICE_URL, LOCAL_AI, `/incidents/analyzed?limit=${limit}`);
    const data = await upstream.json();
    res.json(data);
  } catch (err) {
    // Graceful fallback to correlation engine
    try {
      const fallback = await safeFetch(CORRELATION_URL, LOCAL_CORRELATION, `/incidents?limit=${limit}`);
      const data = await fallback.json();
      res.json(data);
    } catch (errFallback) {
      res.status(503).json({ error: "Upstream incident services unreachable", detail: err.message });
    }
  }
});

// Fetch raw correlated incidents from Correlation Engine
app.get("/api/incidents", async (req, res) => {
  const status = req.query.status ? `&status=${req.query.status}` : "";
  const limit = req.query.limit || 50;
  try {
    const upstream = await safeFetch(CORRELATION_URL, LOCAL_CORRELATION, `/incidents?limit=${limit}${status}`);
    const data = await upstream.json();
    res.json(data);
  } catch (err) {
    res.status(503).json({ error: "Correlation Engine unreachable", detail: err.message });
  }
});

// Trigger immediate on-demand AI RCA cycle
app.post("/api/analyze/now", async (req, res) => {
  try {
    const upstream = await safeFetch(AI_SERVICE_URL, LOCAL_AI, "/analyze/now", { method: "POST" });
    const data = await upstream.json();
    res.json(data);
  } catch (err) {
    res.status(503).json({ error: "AI RCA Service unreachable", detail: err.message });
  }
});

// Semantic Vector RAG runbook search
app.get("/api/rag/search", async (req, res) => {
  const q = req.query.q || "";
  try {
    const upstream = await safeFetch(AI_SERVICE_URL, LOCAL_AI, `/rag/search?q=${encodeURIComponent(q)}`);
    const data = await upstream.json();
    res.json(data);
  } catch (err) {
    res.status(503).json({ error: "RAG vector search service unreachable", detail: err.message });
  }
});

// ------------------------------------------------------------------------------
// 2. Autonomous Remediation AI Agent APIs
// ------------------------------------------------------------------------------

// Trigger immediate autonomous remediation cycle
app.post("/api/remediate/now", async (req, res) => {
  try {
    const upstream = await safeFetch(AI_AGENT_URL, LOCAL_AGENT, "/remediate/now", { method: "POST" });
    const data = await upstream.json();
    res.json(data);
  } catch (err) {
    res.status(503).json({ error: "Remediation Agent unreachable", detail: err.message });
  }
});

// Human-in-the-Loop SRE Approval
app.post("/api/incidents/:id/approve/:actionIndex", async (req, res) => {
  const { id, actionIndex } = req.params;
  const approver = req.query.approver || "human_sre";
  try {
    const upstream = await safeFetch(
      AI_AGENT_URL,
      LOCAL_AGENT,
      `/incidents/${id}/approve/${actionIndex}?approver=${encodeURIComponent(approver)}`,
      { method: "POST" }
    );
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) {
    res.status(503).json({ error: "Remediation Agent approval execution failed", detail: err.message });
  }
});

// Human SRE Rejection
app.post("/api/incidents/:id/reject/:actionIndex", async (req, res) => {
  const { id, actionIndex } = req.params;
  const rejector = req.query.rejector || "human_sre";
  const reason = req.query.reason || "Declined from SRE Console";
  try {
    const upstream = await safeFetch(
      AI_AGENT_URL,
      LOCAL_AGENT,
      `/incidents/${id}/reject/${actionIndex}?rejector=${encodeURIComponent(rejector)}&reason=${encodeURIComponent(reason)}`,
      { method: "POST" }
    );
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) {
    res.status(503).json({ error: "Remediation Agent rejection failed", detail: err.message });
  }
});

// Fetch remediation audit history
app.get("/api/audit/history", async (req, res) => {
  const limit = req.query.limit || 50;
  try {
    const upstream = await safeFetch(AI_AGENT_URL, LOCAL_AGENT, `/audit/history?limit=${limit}`);
    const data = await upstream.json();
    res.json(data);
  } catch (err) {
    res.status(503).json({ error: "Audit history unreachable", detail: err.message });
  }
});

// Circuit breaker status
app.get("/api/circuit-breaker", async (req, res) => {
  try {
    const upstream = await safeFetch(AI_AGENT_URL, LOCAL_AGENT, "/circuit-breaker/status");
    const data = await upstream.json();
    res.json(data);
  } catch (err) {
    res.status(503).json({ error: "Circuit breaker status unreachable", detail: err.message });
  }
});

// ------------------------------------------------------------------------------
// 3. Cluster Topology & Raw Telemetry Feed
// ------------------------------------------------------------------------------

app.get("/api/topology", async (req, res) => {
  const checks = [
    { name: "collector", url: COLLECTOR_URL, local: LOCAL_COLLECTOR, path: "/health" },
    { name: "correlation", url: CORRELATION_URL, local: LOCAL_CORRELATION, path: "/health" },
    { name: "aiService", url: AI_SERVICE_URL, local: LOCAL_AI, path: "/health" },
    { name: "aiAgent", url: AI_AGENT_URL, local: LOCAL_AGENT, path: "/health" },
    { name: "workload", url: WORKLOAD_URL, local: LOCAL_WORKLOAD, path: "/health" },
  ];

  const results = await Promise.allSettled(
    checks.map(async (c) => {
      const start = Date.now();
      const r = await safeFetch(c.url, c.local, c.path, { timeout: 2500 });
      return {
        name: c.name,
        ok: r.ok,
        status: r.status,
        latencyMs: Date.now() - start,
      };
    })
  );

  const statusMap = {};
  checks.forEach((c, idx) => {
    const item = results[idx];
    statusMap[c.name] =
      item.status === "fulfilled" && item.value.ok
        ? { status: "healthy", latencyMs: item.value.latencyMs }
        : { status: "unreachable" };
  });

  res.json({
    timestamp: new Date().toISOString(),
    services: statusMap,
  });
});

app.get("/api/collector/events", async (req, res) => {
  const limit = req.query.limit || 50;
  try {
    const upstream = await safeFetch(COLLECTOR_URL, LOCAL_COLLECTOR, `/events?limit=${limit}`);
    const data = await upstream.json();
    res.json(data);
  } catch (err) {
    res.status(503).json({ error: "Collector events feed unreachable", detail: err.message });
  }
});

// ------------------------------------------------------------------------------
// 4. Chaos Failure Injection (Targets Workload App)
// ------------------------------------------------------------------------------

app.post("/api/simulate/:type", async (req, res) => {
  const { type } = req.params;
  const query = req.url.includes("?") ? req.url.substring(req.url.indexOf("?")) : "";
  try {
    const upstream = await safeFetch(WORKLOAD_URL, LOCAL_WORKLOAD, `/simulate/${type}${query}`, { timeout: 4000 });
    const data = await upstream.json().catch(() => ({ status: "triggered" }));
    res.json(data);
  } catch (err) {
    res.status(503).json({ error: `Simulation trigger failed for '${type}'`, detail: err.message });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`[SentinelOpsAI] Monitoring Gateway Backend running on port ${PORT}`);
});
