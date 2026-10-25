// ==============================================================================
// SentinelOpsAI — SRE Command Center API Client
// ==============================================================================

const BASE_URL = "/api";

async function request(endpoint, options = {}) {
  try {
    const res = await fetch(`${BASE_URL}${endpoint}`, {
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
      ...options,
    });

    if (!res.ok) {
      const errorBody = await res.json().catch(() => ({}));
      const message = errorBody.error || errorBody.detail || `Request failed with status ${res.status}`;
      throw new Error(message);
    }

    return await res.json();
  } catch (err) {
    console.error(`[API Error] ${endpoint}:`, err);
    throw err;
  }
}

// ------------------------------------------------------------------------------
// Incidents & AI RCA
// ------------------------------------------------------------------------------

export async function getAnalyzedIncidents(limit = 50) {
  return request(`/incidents/analyzed?limit=${limit}`);
}

export async function getRawIncidents(status = "", limit = 50) {
  const query = status ? `?status=${encodeURIComponent(status)}&limit=${limit}` : `?limit=${limit}`;
  return request(`/incidents${query}`);
}

export async function triggerAnalysis() {
  return request("/analyze/now", { method: "POST" });
}

// ------------------------------------------------------------------------------
// Remediation & Approvals
// ------------------------------------------------------------------------------

export async function triggerRemediation() {
  return request("/remediate/now", { method: "POST" });
}

export async function approveRemediation(incidentId, actionIndex, approver = "human_sre") {
  return request(`/incidents/${encodeURIComponent(incidentId)}/approve/${actionIndex}?approver=${encodeURIComponent(approver)}`, {
    method: "POST",
  });
}

export async function rejectRemediation(incidentId, actionIndex, rejector = "human_sre", reason = "Declined in Command Center") {
  return request(
    `/incidents/${encodeURIComponent(incidentId)}/reject/${actionIndex}?rejector=${encodeURIComponent(rejector)}&reason=${encodeURIComponent(reason)}`,
    { method: "POST" }
  );
}

export async function getAuditHistory(limit = 50) {
  return request(`/audit/history?limit=${limit}`);
}

export async function getCircuitBreaker() {
  return request("/circuit-breaker");
}

// ------------------------------------------------------------------------------
// Cluster Topology & Telemetry
// ------------------------------------------------------------------------------

export async function getTopology() {
  return request("/topology");
}

export async function getCollectorEvents(limit = 50) {
  return request(`/collector/events?limit=${limit}`);
}

export async function searchRunbooks(query = "") {
  return request(`/rag/search?q=${encodeURIComponent(query)}`);
}

// ------------------------------------------------------------------------------
// Chaos Failure Simulation
// ------------------------------------------------------------------------------

export async function triggerSimulation(type, params = {}) {
  const queryString = new URLSearchParams(params).toString();
  const endpoint = `/simulate/${encodeURIComponent(type)}${queryString ? `?${queryString}` : ""}`;
  return request(endpoint, { method: "POST" });
}
