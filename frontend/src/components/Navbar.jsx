import React from "react";
import { API_BASE } from "../api";

export default function Navbar({ isOnline, latency }) {
  return (
    <header className="glass-panel app-header">
      <div className="brand-badge">
        <div className="brand-icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            <polyline points="9 12 11 14 15 10"/>
          </svg>
        </div>
        <div>
          <h1 className="brand-title">SentinelOps TaskFlow</h1>
          <p className="brand-subtitle">Cloud-Native Telemetry & SRE Testbed</p>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
        <span style={{ fontSize: "0.75rem", fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
          API: {API_BASE}
        </span>
        <div className="system-status">
          <span className={`status-dot ${isOnline ? "online" : "offline"}`}></span>
          <span>{isOnline ? "Backend Live" : "Backend Offline"}</span>
          {latency !== null && isOnline && (
            <span style={{ color: "var(--text-muted)", fontSize: "0.75rem", fontFamily: "var(--font-mono)" }}>
              ({latency}ms)
            </span>
          )}
        </div>
      </div>
    </header>
  );
}
