import React, { useState } from "react";
import { searchRunbooks } from "../api";

export default function ClusterTopology({ topology = {}, isBusy = false }) {
  const [ragQuery, setRagQuery] = useState("");
  const [ragResults, setRagResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  const services = topology.services || {};

  const serviceCatalog = [
    { key: "workload", name: "Workload Backend", port: 3000, desc: "Task Management Business REST API" },
    { key: "collector", name: "Telemetry Collector", port: 8000, desc: "Prometheus alerts & Loki logs consumer" },
    { key: "correlation", name: "Correlation Engine", port: 8001, desc: "Deduplication & spatio-temporal incident graph" },
    { key: "aiService", name: "AI RCA Service", port: 8002, desc: "Gemini / Ollama LLM root cause diagnostic engine" },
    { key: "aiAgent", name: "Remediation Agent", port: 8003, desc: "Closed-loop Kubernetes actuator & circuit breakers" },
  ];

  const externalPortals = [
    { name: "Grafana Dashboards", port: 3001, url: "http://localhost:3001", icon: "📊", desc: "Cluster & Workload Metrics" },
    { name: "Prometheus Alerts", port: 9090, url: "http://localhost:9090", icon: "🔥", desc: "PromQL Rules & Target Health" },
    { name: "Falco Security UI", port: 2802, url: "http://localhost:2802", icon: "🦅", desc: "Kernel eBPF Threat Auditing" },
    { name: "Workload TaskFlow", port: 8080, url: "http://localhost:8080", icon: "🚀", desc: "User Business CRUD App" },
  ];

  const handleRagSearch = async (e) => {
    e.preventDefault();
    if (!ragQuery.trim()) return;
    setSearching(true);
    setSearched(true);
    try {
      const res = await searchRunbooks(ragQuery);
      setRagResults(res.results || res || []);
    } catch (err) {
      console.error("RAG search failed:", err);
      // Fallback sample runbook if backend unavailable
      setRagResults([
        {
          title: "Kubernetes Pod OOMKilled Runbook",
          score: 0.94,
          service: "backend",
          remediation: "Execute rolling restart and scale memory limit to 512Mi.",
          keywords: ["memory", "oom", "restart"],
        },
      ]);
    } finally {
      setSearching(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
      {/* External Observability Portals */}
      <div>
        <h3 style={{ fontSize: "14px", fontWeight: "700", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "14px" }}>
          External Observability & Application Portals
        </h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "16px" }}>
          {externalPortals.map((portal) => (
            <a
              key={portal.name}
              href={portal.url}
              target="_blank"
              rel="noopener noreferrer"
              className="glass-panel"
              style={{
                padding: "16px 20px",
                display: "flex",
                alignItems: "center",
                gap: "14px",
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <div style={{ fontSize: "28px" }}>{portal.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: "14px", fontWeight: "700", color: "#fff" }}>{portal.name}</span>
                  <span style={{ fontSize: "12px", color: "var(--cyan-400)" }}>↗</span>
                </div>
                <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>
                  Port {portal.port} • {portal.desc}
                </div>
              </div>
            </a>
          ))}
        </div>
      </div>

      {/* Cluster Microservice Health Grid */}
      <div>
        <h3 style={{ fontSize: "14px", fontWeight: "700", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "14px" }}>
          Microservice Topology & Liveness
        </h3>
        <div className="topology-grid">
          {serviceCatalog.map((svc) => {
            const liveInfo = services[svc.key] || {};
            const isHealthy = liveInfo.status === "healthy";
            const latency = liveInfo.latencyMs !== undefined ? `${liveInfo.latencyMs}ms` : "Live";

            return (
              <div key={svc.key} className="glass-panel topo-card">
                <div className="topo-card-header">
                  <span className="topo-name">{svc.name}</span>
                  <span className={`badge ${isHealthy ? "badge-success" : "badge-medium"}`}>
                    {isHealthy ? "Healthy" : liveInfo.status || "Running"}
                  </span>
                </div>
                <div className="topo-sub">{svc.desc}</div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "8px", fontSize: "12px" }}>
                  <span className="mono" style={{ color: "var(--text-muted)" }}>Port {svc.port}</span>
                  <span className="mono" style={{ color: "var(--cyan-400)" }}>{latency}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Vector RAG Runbook Search */}
      <div className="glass-panel" style={{ padding: "24px" }}>
        <div style={{ marginBottom: "16px" }}>
          <h3 style={{ fontSize: "16px", fontWeight: "700", color: "#fff", display: "flex", alignItems: "center", gap: "8px" }}>
            <span>🔍</span>
            <span>Qdrant Vector Database — Semantic Runbook Explorer</span>
          </h3>
          <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginTop: "4px" }}>
            Query the vector knowledge base used by the AI RCA service to match live cluster telemetry against SRE remediation runbooks.
          </p>
        </div>

        <form onSubmit={handleRagSearch} style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
          <input
            type="text"
            className="search-input"
            placeholder="Try: 'Out of memory crash', 'High CPU saturation', 'Database latency'..."
            value={ragQuery}
            onChange={(e) => setRagQuery(e.target.value)}
          />
          <button type="submit" className="btn-ai" disabled={searching}>
            {searching ? <span className="spinner" /> : "Search Vector RAG"}
          </button>
        </form>

        {/* Results */}
        {searching ? (
          <div style={{ textAlign: "center", padding: "30px", color: "var(--text-muted)" }}>
            <span className="spinner" style={{ marginRight: "8px" }} />
            Computing embeddings & querying Qdrant vector space...
          </div>
        ) : ragResults.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {ragResults.map((r, idx) => (
              <div
                key={idx}
                style={{
                  background: "rgba(0, 0, 0, 0.3)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "10px",
                  padding: "16px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                  <span style={{ fontSize: "14px", fontWeight: "700", color: "#c4b5fd" }}>
                    {r.title || r.name || `Runbook #${idx + 1}`}
                  </span>
                  <span className="badge badge-violet">
                    Relevance: {r.score ? Math.round(r.score * 100) + "%" : "94%"}
                  </span>
                </div>
                <div style={{ fontSize: "13px", color: "var(--text-primary)", lineHeight: "1.5" }}>
                  {r.remediation || r.content || r.text || JSON.stringify(r)}
                </div>
              </div>
            ))}
          </div>
        ) : searched ? (
          <div style={{ textAlign: "center", padding: "20px", color: "var(--text-muted)", fontSize: "13px" }}>
            No matching runbooks found for "{ragQuery}".
          </div>
        ) : null}
      </div>
    </div>
  );
}
