// ==============================================================================
// SentinelOpsAI — Centralized Multi-Service API Client
// ==============================================================================
// Dynamically resolves endpoints for Backend, Correlation, AI, and Agent services
// Supports local Vite dev, localhost port-forwarding, and Nginx reverse proxy

function resolveServiceUrl(envVar, prodPath, localPort) {
  if (envVar && envVar.trim() !== "") {
    return envVar.replace(/\/$/, "");
  }
  if (typeof window !== "undefined") {
    // If not running on local Vite dev server port (5173), use same-origin proxy
    if (window.location.port !== "5173") {
      return `${window.location.origin}${prodPath}`;
    }
  }
  return `http://localhost:${localPort}`;
}

const API_BASE = resolveServiceUrl(import.meta.env.VITE_API_URL, "", 3000);
const CORR_BASE = resolveServiceUrl(import.meta.env.VITE_CORRELATION_URL, "/corr-api", 8001);
const AI_BASE = resolveServiceUrl(import.meta.env.VITE_AI_URL, "/ai-api", 8002);
const AGENT_BASE = resolveServiceUrl(import.meta.env.VITE_AGENT_URL, "/agent-api", 8003);

// ------------------------------------------------------------------------------
// 1. Backend Core & ToDo Workload APIs
// ------------------------------------------------------------------------------

export async function checkHealth() {
  const res = await fetch(`${API_BASE}/health`);
  if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
  return res.json();
}

export async function getTodos() {
  const res = await fetch(`${API_BASE}/api/todos`);
  if (!res.ok) throw new Error(`Failed to fetch tasks: ${res.status}`);
  return res.json();
}

export async function createTodo({ title, description, priority }) {
  const res = await fetch(`${API_BASE}/api/todos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, description, priority }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to create task: ${res.status}`);
  }
  return res.json();
}

export async function updateTodo(id, updates) {
  const res = await fetch(`${API_BASE}/api/todos/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error(`Failed to update task: ${res.status}`);
  return res.json();
}

export async function deleteTodo(id) {
  const res = await fetch(`${API_BASE}/api/todos/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`Failed to delete task: ${res.status}`);
  return res.json();
}

// Failure simulation endpoints
export async function triggerSimLeak(mb = 20) {
  const res = await fetch(`${API_BASE}/simulate/leak?mb=${mb}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Leak simulation failed: ${res.status}`);
  }
  return res.json();
}

export async function triggerSimSlow(ms = 3000) {
  const res = await fetch(`${API_BASE}/simulate/slow?ms=${ms}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Slow simulation failed: ${res.status}`);
  }
  return res.json();
}

export async function triggerSimCrash() {
  const res = await fetch(`${API_BASE}/simulate/crash`);
  if (!res.ok && res.status !== 500) {
    throw new Error(`Crash simulation failed: ${res.status}`);
  }
  return { status: "crashing", message: "Process termination initiated" };
}

export async function getSimStatus() {
  const res = await fetch(`${API_BASE}/simulate/status`);
  if (!res.ok) return null;
  return res.json();
}

// ------------------------------------------------------------------------------
// 2. Correlation Engine APIs (Port 8001)
// ------------------------------------------------------------------------------

export async function getIncidents(status = null, limit = 50) {
  const url = new URL(`${CORR_BASE}/incidents`);
  if (status) url.searchParams.set("status", status);
  url.searchParams.set("limit", limit.toString());

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Failed to fetch incidents: ${res.status}`);
  return res.json();
}

export async function getIncidentStats() {
  const res = await fetch(`${CORR_BASE}/incidents/stats/summary`);
  if (!res.ok) return null;
  return res.json();
}

// ------------------------------------------------------------------------------
// 3. AI Root Cause Analysis & Vector RAG APIs (Port 8002)
// ------------------------------------------------------------------------------

export async function getAnalyzedIncidents(limit = 50) {
  const res = await fetch(`${AI_BASE}/incidents/analyzed?limit=${limit}`);
  if (!res.ok) throw new Error(`Failed to fetch analyzed incidents: ${res.status}`);
  return res.json();
}

export async function triggerAnalysisNow() {
  const res = await fetch(`${AI_BASE}/analyze/now`, { method: "POST" });
  if (!res.ok) throw new Error(`Failed to trigger analysis: ${res.status}`);
  return res.json();
}

export async function searchRunbooks(queryText) {
  const url = `${AI_BASE}/rag/search?q=${encodeURIComponent(queryText)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`RAG search failed: ${res.status}`);
  return res.json();
}

// ------------------------------------------------------------------------------
// 4. Autonomous Remediation AI Agent APIs (Port 8003)
// ------------------------------------------------------------------------------

export async function triggerRemediationNow() {
  const res = await fetch(`${AGENT_BASE}/remediate/now`, { method: "POST" });
  if (!res.ok) throw new Error(`Failed to trigger remediation: ${res.status}`);
  return res.json();
}

export async function approveAction(incidentId, actionIndex, approver = "human_sre") {
  const url = `${AGENT_BASE}/incidents/${incidentId}/approve/${actionIndex}?approver=${encodeURIComponent(approver)}`;
  const res = await fetch(url, { method: "POST" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Approval failed with status ${res.status}`);
  }
  return res.json();
}

export async function rejectAction(incidentId, actionIndex, rejector = "human_sre", reason = "Declined by SRE") {
  const url = `${AGENT_BASE}/incidents/${incidentId}/reject/${actionIndex}?rejector=${encodeURIComponent(rejector)}&reason=${encodeURIComponent(reason)}`;
  const res = await fetch(url, { method: "POST" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Rejection failed with status ${res.status}`);
  }
  return res.json();
}

export async function getAuditHistory(limit = 50) {
  const res = await fetch(`${AGENT_BASE}/audit/history?limit=${limit}`);
  if (!res.ok) throw new Error(`Failed to fetch audit history: ${res.status}`);
  return res.json();
}

export async function getCircuitBreakerStats() {
  const res = await fetch(`${AGENT_BASE}/circuit-breaker/status`);
  if (!res.ok) return null;
  return res.json();
}

export { API_BASE, CORR_BASE, AI_BASE, AGENT_BASE };
