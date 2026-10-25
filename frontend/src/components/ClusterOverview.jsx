import React, { useState } from "react";
import { searchRunbooks } from "../api";

export default function ClusterOverview() {
  const [ragQuery, setRagQuery] = useState("");
  const [ragResult, setRagResult] = useState(null);
  const [searching, setSearching] = useState(false);

  const services = [
    { name: "Node.js Backend", port: "3000", role: "Workload App (200Mi limit)", status: "Active", icon: "📦" },
    { name: "Telemetry Collector", port: "8000", role: "Prometheus / Loki / Falco Pollers", status: "Active", icon: "📡" },
    { name: "Correlation Engine", port: "8001", role: "Multi-Source Telemetry Fusion", status: "Active", icon: "⚡" },
    { name: "Qdrant Vector DB", port: "6333", role: "SRE Runbook Semantic Storage", status: "Active", icon: "🧠" },
    { name: "AI RCA & RAG Service", port: "8002", role: "Root Cause Reasoning Engine", status: "Active", icon: "🤖" },
    { name: "Remediation AI Agent", port: "8003", role: "Closed-Loop Kubernetes Healer", status: "Active", icon: "🛡️" },
  ];

  const tools = [
    {
      name: "Grafana Observability",
      url: "http://localhost:3001",
      role: "SRE Dashboards (P95, Memory vs 200Mi, Restarts)",
      icon: "📊",
    },
    {
      name: "Prometheus Web UI",
      url: "http://localhost:9090",
      role: "Targets & PromQL Expression Explorer",
      icon: "📈",
    },
    {
      name: "Falcosidekick UI",
      url: "http://localhost:2802",
      role: "eBPF Runtime Threat Event Monitor",
      icon: "🛡️",
    },
    {
      name: "Collector Event Feed",
      url: "http://localhost:8000/events",
      role: "Normalized Raw Ingested Telemetry API",
      icon: "📜",
    },
  ];

  const handleSearchRag = async (e) => {
    e.preventDefault();
    if (!ragQuery.trim()) return;
    setSearching(true);
    try {
      const res = await searchRunbooks(ragQuery);
      setRagResult(res);
    } catch (err) {
      setRagResult({ error: err.message });
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="cluster-overview-container">
      {/* Platform Microservice Topology */}
      <div className="glass-panel overview-section">
        <div className="panel-subhead">
          <h3>SentinelOpsAI Microservice Grid</h3>
          <span className="subhead-meta">Kubernetes Namespace: sentinelopsai</span>
        </div>

        <div className="service-cards-grid">
          {services.map((svc, idx) => (
            <div key={idx} className="service-card glass-panel">
              <div className="service-icon">{svc.icon}</div>
              <div className="service-info">
                <h4>{svc.name}</h4>
                <p className="service-role">{svc.role}</p>
                <div className="service-footer">
                  <span className="badge badge-success">Port {svc.port}</span>
                  <span className="service-status">● {svc.status}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Observability Quick-Links */}
      <div className="glass-panel overview-section">
        <div className="panel-subhead">
          <h3>Observability & Security Web Portals</h3>
          <span className="subhead-meta">Direct Tunnel Links (via background port-forwarding)</span>
        </div>

        <div className="tools-grid">
          {tools.map((t, idx) => (
            <a
              key={idx}
              href={t.url}
              target="_blank"
              rel="noopener noreferrer"
              className="tool-card glass-panel"
            >
              <div className="tool-icon">{t.icon}</div>
              <div className="tool-details">
                <h4>{t.name} ↗</h4>
                <p>{t.role}</p>
                <span className="tool-url">{t.url}</span>
              </div>
            </a>
          ))}
        </div>
      </div>

      {/* Natural Language Vector RAG Explorer */}
      <div className="glass-panel overview-section">
        <div className="panel-subhead">
          <h3>SRE Knowledge Base Semantic Explorer (Vector RAG)</h3>
          <span className="subhead-meta">Queries Qdrant Vector Store at Port 6333</span>
        </div>

        <form onSubmit={handleSearchRag} className="rag-search-form">
          <input
            type="text"
            className="rag-input"
            placeholder="Ask SRE Knowledge Base (e.g. 'How to fix OOMKilled container?' or 'Pod in CrashLoopBackOff')"
            value={ragQuery}
            onChange={(e) => setRagQuery(e.target.value)}
          />
          <button type="submit" className="btn btn-primary" disabled={searching}>
            {searching ? "Searching..." : "Semantic Search"}
          </button>
        </form>

        {ragResult && (
          <div className="rag-result-box">
            {ragResult.error ? (
              <div className="feedback-banner error">{ragResult.error}</div>
            ) : (
              <div>
                <h5>Retrieved SRE Runbook Context:</h5>
                <pre className="rag-context-text">
                  {ragResult.retrieved_context || "No matching runbooks found for query."}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
