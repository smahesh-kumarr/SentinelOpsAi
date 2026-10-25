import React from "react";
import { API_BASE } from "../api";

export default function Navbar({ isOnline, latency, activeTab, setActiveTab, incidentCount = 0 }) {
  const tabs = [
    { id: "incidents", label: "AI Incident Response", icon: "🛡️", badge: incidentCount },
    { id: "workload", label: "Workload & Tasks", icon: "📋" },
    { id: "audit", label: "Remediation Audit", icon: "📜" },
    { id: "topology", label: "Cluster Observability", icon: "🌐" },
  ];

  return (
    <header className="glass-panel app-header">
      <div className="header-left">
        <div className="brand-badge">
          <div className="brand-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              <polyline points="9 12 11 14 15 10"/>
            </svg>
          </div>
          <div>
            <h1 className="brand-title">SentinelOpsAI</h1>
            <p className="brand-subtitle">Autonomous AIOps & SecOps Kubernetes Platform</p>
          </div>
        </div>

        {/* Tab Navigation */}
        <nav className="header-tabs">
          {tabs.map((t) => (
            <button
              key={t.id}
              className={`tab-btn ${activeTab === t.id ? "active" : ""}`}
              onClick={() => setActiveTab(t.id)}
            >
              <span className="tab-icon">{t.icon}</span>
              <span>{t.label}</span>
              {t.badge > 0 && <span className="tab-badge">{t.badge}</span>}
            </button>
          ))}
        </nav>
      </div>

      <div className="header-right">
        <div className="system-status">
          <span className={`status-dot ${isOnline ? "online" : "offline"}`}></span>
          <span>{isOnline ? "Cluster Live" : "Cluster Disconnected"}</span>
          {latency !== null && isOnline && (
            <span className="latency-tag">
              {latency}ms
            </span>
          )}
        </div>
      </div>
    </header>
  );
}
