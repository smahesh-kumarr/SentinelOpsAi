import React from "react";

export default function MetricsBar({ todos, simStatus }) {
  const total = todos.length;
  const completed = todos.filter((t) => t.completed).length;
  const active = total - completed;
  const leakedMB = simStatus?.totalLeakedMB || 0;

  return (
    <div className="metrics-grid">
      <div className="glass-panel metric-card">
        <div>
          <div className="metric-label">Total Tasks</div>
          <div className="metric-val">{total}</div>
        </div>
        <div className="metric-icon-wrap" style={{ color: "#6366f1" }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/>
            <line x1="8" y1="2" x2="8" y2="6"/>
            <line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
        </div>
      </div>

      <div className="glass-panel metric-card">
        <div>
          <div className="metric-label">Pending Execution</div>
          <div className="metric-val" style={{ color: "#f59e0b" }}>{active}</div>
        </div>
        <div className="metric-icon-wrap" style={{ color: "#f59e0b" }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
        </div>
      </div>

      <div className="glass-panel metric-card">
        <div>
          <div className="metric-label">Completed</div>
          <div className="metric-val" style={{ color: "#10b981" }}>{completed}</div>
        </div>
        <div className="metric-icon-wrap" style={{ color: "#10b981" }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
        </div>
      </div>

      <div className="glass-panel metric-card">
        <div>
          <div className="metric-label">Leaked Memory</div>
          <div className="metric-val" style={{ color: leakedMB > 100 ? "#ef4444" : "#06b6d4" }}>
            {leakedMB} <span style={{ fontSize: "0.9rem" }}>MB</span>
          </div>
        </div>
        <div className="metric-icon-wrap" style={{ color: leakedMB > 100 ? "#ef4444" : "#06b6d4" }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
          </svg>
        </div>
      </div>
    </div>
  );
}
