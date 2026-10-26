import React from "react";

export default function Navbar({ activeTab, onSelectTab, incidentCount = 0, isRefreshing = false, onRefresh }) {
  return (
    <header className="navbar">
      <div className="brand-section">
        <div className="brand-logo">🛡️</div>
        <div>
          <div className="brand-title">SentinelOpsAI</div>
        </div>
        <div className="brand-tag">
          <span className="live-dot" />
          SRE COMMAND CENTER
        </div>
      </div>

      <nav className="nav-tabs">
        <button
          className={`nav-tab-btn ${activeTab === "incidents" ? "active" : ""}`}
          onClick={() => onSelectTab("incidents")}
        >
          <span>⚡</span>
          <span>Incidents & AI RCA</span>
          {incidentCount > 0 && <span className="tab-badge">{incidentCount}</span>}
        </button>

        <button
          className={`nav-tab-btn ${activeTab === "audit" ? "active" : ""}`}
          onClick={() => onSelectTab("audit")}
        >
          <span>🛡️</span>
          <span>Remediation Ledger</span>
        </button>

        <button
          className={`nav-tab-btn ${activeTab === "topology" ? "active" : ""}`}
          onClick={() => onSelectTab("topology")}
        >
          <span>🌐</span>
          <span>Topology & RAG</span>
        </button>

        <button
          className={`nav-tab-btn ${activeTab === "chaos" ? "active" : ""}`}
          onClick={() => onSelectTab("chaos")}
        >
          <span>💥</span>
          <span>Chaos Lab</span>
        </button>

        <button
          className={`nav-tab-btn ${activeTab === "chatbot" ? "active" : ""}`}
          onClick={() => onSelectTab("chatbot")}
        >
          <span>🤖</span>
          <span>SRE Copilot</span>
        </button>
      </nav>

      <div className="nav-actions">
        <a
          href="http://localhost:8080"
          target="_blank"
          rel="noopener noreferrer"
          className="workload-link-btn"
          title="Open Business Workload Application"
        >
          <span>TaskFlow App (Port 8080)</span>
          <span>↗</span>
        </a>

        <button
          className="refresh-btn"
          onClick={onRefresh}
          disabled={isRefreshing}
          title="Refresh All Feeds"
        >
          {isRefreshing ? <span className="spinner" /> : "↻"}
          <span>Refresh</span>
        </button>
      </div>
    </header>
  );
}
