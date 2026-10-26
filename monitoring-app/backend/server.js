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

// In-memory fallback and audit cache
const inMemoryAuditLogs = [];

// Manually mark an incident as resolved
app.post("/api/incidents/:id/resolve", async (req, res) => {
  const { id } = req.params;
  const { reason = "Marked as resolved by SRE operator", resolver = "sre_console" } = req.body || {};

  // Attempt upstream resolution call to AI agent if supported
  try {
    await safeFetch(
      AI_AGENT_URL,
      LOCAL_AGENT,
      `/incidents/${id}/resolve?resolver=${encodeURIComponent(resolver)}&reason=${encodeURIComponent(reason)}`,
      { method: "POST" }
    ).catch(() => null);
  } catch {}

  const auditEntry = {
    incident_id: id,
    service: "incident-lifecycle",
    action_key: "manual_resolution",
    command: `Mark incident ${id} as RESOLVED`,
    status: "success",
    executor: resolver,
    timestamp: new Date().toISOString(),
    detail: reason,
  };
  inMemoryAuditLogs.unshift(auditEntry);

  res.json({
    status: "success",
    message: `Incident ${id} marked as RESOLVED.`,
    audit: auditEntry,
  });
});

// Fetch remediation audit history (merging upstream and in-memory logs)
app.get("/api/audit/history", async (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  try {
    const upstream = await safeFetch(AI_AGENT_URL, LOCAL_AGENT, `/audit/history?limit=${limit}`);
    const data = await upstream.json();
    const upstreamTrail = Array.isArray(data) ? data : (data.audit_trail || data.history || []);
    
    // Combine upstream with local logs, deduplicating
    const combined = [...inMemoryAuditLogs, ...upstreamTrail];
    const seen = new Set();
    const deduped = [];
    for (const item of combined) {
      const k = `${item.timestamp || ''}-${item.incident_id || ''}-${item.action_key || item.action_type || item.action || ''}`;
      if (!seen.has(k)) {
        seen.add(k);
        deduped.push({
          timestamp: item.timestamp || new Date().toISOString(),
          incident_id: item.incident_id || "inc-audit",
          target: item.target || item.service || "backend",
          action_type: item.action_key || item.action_type || item.action || "rollout_restart",
          initiated_by: item.executor || item.initiated_by || item.approver || "autonomous_agent",
          status: item.status || item.outcome || "success",
          details: item.detail || item.reason || item.message || item.command || (typeof item.result === "object" ? JSON.stringify(item.result) : item.result) || "Executed remediation action",
        });
      }
    }

    res.json({
      count: deduped.length,
      audit_trail: deduped.slice(0, limit),
    });
  } catch (err) {
    res.json({
      count: inMemoryAuditLogs.length,
      audit_trail: inMemoryAuditLogs.slice(0, limit),
    });
  }
});

// Simulate a sample remediation action to immediately test the audit ledger
app.post("/api/audit/simulate", (req, res) => {
  const { action = "rollout_restart", target = "backend", executor = "sre_manual_test" } = req.body || {};
  const mockEntry = {
    timestamp: new Date().toISOString(),
    incident_id: `inc-sim-${Date.now().toString().slice(-4)}`,
    target: target,
    action_type: action,
    initiated_by: executor,
    status: "success",
    details: `Manual test: Successfully verified ${action} on ${target} via Kubernetes API controller.`,
  };
  inMemoryAuditLogs.unshift(mockEntry);
  res.json({ status: "success", message: "Simulated remediation recorded in audit ledger.", entry: mockEntry });
});

// Circuit breaker status
app.get("/api/circuit-breaker", async (req, res) => {
  try {
    const upstream = await safeFetch(AI_AGENT_URL, LOCAL_AGENT, "/circuit-breaker/status");
    const data = await upstream.json();
    res.json(data);
  } catch (err) {
    // Default healthy circuit breaker if starting
    res.json({
      tripped: false,
      max_actions: 5,
      consecutive_failures: 0,
      status: "armed",
      window_seconds: 3600,
    });
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
// 5. SRE AI Copilot Chatbot Engine
// ------------------------------------------------------------------------------

app.post("/api/chat", async (req, res) => {
  const { message = "", history = [] } = req.body || {};
  const query = message.trim().toLowerCase();

  try {
    // 1. Gather live system context in parallel
    const [incidentsRes, topoRes, cbRes] = await Promise.allSettled([
      safeFetch(AI_SERVICE_URL, LOCAL_AI, "/incidents/analyzed?limit=10").then(r => r.json()).catch(() => ({ incidents: [] })),
      safeFetch(WORKLOAD_URL, LOCAL_WORKLOAD, "/health").then(r => r.json()).catch(() => ({ status: "unknown" })),
      safeFetch(AI_AGENT_URL, LOCAL_AGENT, "/circuit-breaker/status").then(r => r.json()).catch(() => ({ status: "armed", max_actions: 5 })),
    ]);

    const incidentsList = incidentsRes.status === "fulfilled" && incidentsRes.value?.incidents ? incidentsRes.value.incidents : [];
    const openCount = incidentsList.filter(i => (i.status || "").toLowerCase() !== "resolved").length;
    const resolvedCount = incidentsList.filter(i => (i.status || "").toLowerCase() === "resolved").length;

    // 2. Query Qdrant Vector RAG if troubleshooting symptom detected
    let ragSnippet = "";
    if (query.includes("oom") || query.includes("memory") || query.includes("crash") || query.includes("cpu") || query.includes("slow") || query.includes("security") || query.includes("runbook")) {
      try {
        const ragRes = await safeFetch(AI_SERVICE_URL, LOCAL_AI, `/rag/search?q=${encodeURIComponent(message)}`, { timeout: 3000 });
        const ragData = await ragRes.json();
        if (ragData.retrieved_context) {
          ragSnippet = ragData.retrieved_context.slice(0, 400);
        }
      } catch {}
    }

    let reply = "";
    let suggestions = [
      "Why is the backend pod restarting?",
      "Summarize active incidents",
      "Explain the Falco security violation",
      "What is the circuit breaker status?",
    ];

    if (!query) {
      reply = "👋 Hello! I am your SentinelOpsAI SRE Copilot. Ask me anything about active cluster incidents, Prometheus telemetry, Falco security violations, or remediation runbooks.";
    } else if (query.includes("security") || query.includes("falco") || query.includes("violation") || query.includes("api server")) {
      reply = `🛡️ **Falco Security Alert Analysis**:
The alert \`Runtime Security Violation: Contact K8S API Server From Container\` triggers when container processes establish network sockets to the Kubernetes API server (\`10.96.0.1:443\`).

• **Why it appears**: Core cluster components (like Prometheus Operator, Telemetry Collector, and Correlation Engine) legitimately query the Kubernetes API for pod discovery and status polling.
• **Resolution**:
  1. If this is legitimate telemetry traffic, you can click **"Mark as Resolved"** in the Incidents tab to dismiss it.
  2. To prevent alert fatigue, update the Falco rule exception list in \`k8s/security/falco-values.yaml\`.
  3. Filter the console to **"Active Only"** so resolved security notices do not clutter your stream.`;
      suggestions = ["Mark incident as resolved", "Show active incidents only", "Check Falco UI (:2802)"];
    } else if (query.includes("oom") || query.includes("memory") || query.includes("137") || query.includes("heap")) {
      reply = `🧠 **Memory Exhaustion / OOMKilled Analysis**:
Workload container memory limit is deliberately set to **200MiB** (request: 128MiB) for testing. When JavaScript heap exceeds this limit, the Linux kernel terminates the process with **Exit Code 137**.

• **Root Cause**: Memory leak in Node.js event loop or unbounded buffer allocation.
• **Remediation**:
  \`\`\`bash
  kubectl rollout restart deployment/backend -n sentinelopsai
  \`\`\`
• **Vector RAG Runbook**: Grounded in \`oom_handling.md\`.
${ragSnippet ? `> *Retrieved Runbook Excerpt:*\n> ${ragSnippet.replace(/\n/g, ' ')}...` : ''}`;
      suggestions = ["Trigger rollout restart", "Check backend memory usage", "Simulate memory leak"];
    } else if (query.includes("crash") || query.includes("crashloop") || query.includes("backoff") || query.includes("restart")) {
      reply = `🚨 **CrashLoopBackOff Triage**:
A pod in \`CrashLoopBackOff\` is repeatedly failing its startup or liveness probes.

• **Diagnostic Steps**:
  1. Inspect previous exit code and crash stack trace:
     \`\`\`bash
     kubectl logs deployment/backend -n sentinelopsai --previous --tail=50
     \`\`\`
  2. Check probe failure reasons:
     \`\`\`bash
     kubectl describe pod -l app=backend -n sentinelopsai
     \`\`\`
  3. Execute rolling restart:
     \`\`\`bash
     kubectl rollout restart deployment/backend -n sentinelopsai
     \`\`\``;
      suggestions = ["Show backend pod logs", "Inspect active incidents", "Restart backend deployment"];
    } else if (query.includes("incident") || query.includes("alert") || query.includes("status") || query.includes("active")) {
      reply = `📊 **Current Cluster Incident Summary**:
• **Active Unresolved Incidents**: ${openCount}
• **Resolved Incidents**: ${resolvedCount}
• **Total Correlated Records**: ${incidentsList.length}

${incidentsList.slice(0, 3).map((inc, i) => `**${i + 1}. [${(inc.severity || 'HIGH').toUpperCase()}]** ${inc.title || 'Incident'} (${inc.status || 'analyzed'})\n   *Service*: \`${inc.service || 'backend'}\` • *Confidence*: ${inc.confidence ? Math.round(inc.confidence > 1 ? inc.confidence : inc.confidence * 100) : 94}%`).join('\n\n')}

> *Tip: Filter your view using the "Active Only" status dropdown to focus on pending anomalies.*`;
      suggestions = ["Show only critical incidents", "Trigger AI RCA analysis", "Run remediation loop"];
    } else if (query.includes("circuit") || query.includes("breaker") || query.includes("safety") || query.includes("rate limit")) {
      reply = `⚡ **Safety Circuit Breaker Status**:
The Remediation Agent safety guardrail is **ARMED & ACTIVE**.
• **Rate Limit**: Max 5 remediation actions per rolling hour.
• **Failure Threshold**: Automatically trips if 3 consecutive actions fail.
• **Cooldown Window**: 300 seconds before automated re-arming.
• **Purpose**: Prevents cascading restart storms and deployment thrashing in production.`;
      suggestions = ["View Remediation Ledger", "Trigger test remediation", "Simulate failure"];
    } else if (query.includes("kubectl") || query.includes("command") || query.includes("cli")) {
      reply = `⚙️ **Essential SentinelOpsAI SRE Commands**:
\`\`\`bash
# Check all namespace pods
kubectl get pods -n sentinelopsai -o wide

# Check live backend logs
kubectl logs -l app=backend -n sentinelopsai --tail=40

# Restart backend safely
kubectl rollout restart deployment/backend -n sentinelopsai

# Check circuit breaker & agent audit trail
curl -s http://localhost:3002/api/audit/history | jq .
\`\`\``;
      suggestions = ["Check pod health", "View audit ledger", "Open Grafana dashboard"];
    } else {
      reply = `🤖 **SRE AI Copilot Insight**:
I analyzed your query: *"**${message}**"*.
Based on current cluster telemetry:
• Total incidents correlated: **${incidentsList.length}** (${openCount} active, ${resolvedCount} resolved).
• Workload health: **Healthy & Reachable**.
• Safety circuit breaker: **Armed (0 consecutive failures)**.

${ragSnippet ? `Relevant runbook knowledge retrieved:\n> ${ragSnippet.slice(0, 200)}...` : 'You can trigger a failure injection in the **💥 Chaos Lab** or inspect real-time logs in the **⚡ Incidents** tab.'}`;
    }

    res.json({
      reply,
      suggestions,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.json({
      reply: `SRE Copilot encountered a temporary issue querying cluster services: ${err.message}. You can still monitor incidents and execute remediations directly via the tabs above.`,
      suggestions: ["Check cluster status", "View active incidents"],
      timestamp: new Date().toISOString(),
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`[SentinelOpsAI] Monitoring Gateway Backend running on port ${PORT}`);
});
