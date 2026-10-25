import React, { useState, useEffect, useCallback } from "react";
import { getAuditHistory, getCircuitBreakerStats, triggerRemediationNow } from "../api";

export default function AuditTrail() {
  const [auditLogs, setAuditLogs] = useState([]);
  const [circuitBreaker, setCircuitBreaker] = useState(null);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const history = await getAuditHistory(50);
      setAuditLogs(history.audit_trail || []);
      const cb = await getCircuitBreakerStats();
      if (cb) setCircuitBreaker(cb);
    } catch (err) {
      console.error("Failed to load audit history:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleRunRemediation = async () => {
    setTriggering(true);
    setFeedback(null);
    try {
      const res = await triggerRemediationNow();
      setFeedback({
        type: "success",
        msg: `Remediation executed: ${res.executed_count || 0} actions performed.`,
      });
      await fetchData();
    } catch (err) {
      setFeedback({ type: "error", msg: `Failed: ${err.message}` });
    } finally {
      setTriggering(false);
    }
  };

  return (
    <div className="audit-trail-container">
      {/* Top Stats Banner */}
      <div className="audit-header glass-panel">
        <div className="header-stats">
          <div className="stat-card">
            <span className="stat-label">Total Remediations</span>
            <span className="stat-val">{auditLogs.length}</span>
          </div>
          <div className="stat-card success">
            <span className="stat-label">Verified Self-Healed</span>
            <span className="stat-val text-success">
              {auditLogs.filter((l) => (l.status || "").toLowerCase().includes("verified") || l.status === "success" || l.status === "executed").length}
            </span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Circuit Breaker</span>
            <span className="stat-val text-info">
              {circuitBreaker?.circuit_open ? "OPEN (Throttled)" : "NORMAL (Healthy)"}
            </span>
          </div>
        </div>

        <div className="header-controls">
          <button className="btn btn-secondary" onClick={fetchData} disabled={loading}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            Refresh
          </button>

          <button
            className={`btn btn-primary ${triggering ? "loading" : ""}`}
            onClick={handleRunRemediation}
            disabled={triggering}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
            {triggering ? "Running..." : "Run Remediation Cycle"}
          </button>
        </div>
      </div>

      {feedback && (
        <div className={`feedback-banner ${feedback.type}`}>
          <span>{feedback.msg}</span>
          <button className="close-btn" onClick={() => setFeedback(null)}>×</button>
        </div>
      )}

      {/* Audit Log Table */}
      <div className="glass-panel audit-table-wrapper">
        <div className="panel-subhead">
          <h3>Immutable Remediation Audit History ({auditLogs.length})</h3>
          <span className="subhead-meta">Live Closed-Loop Kubernetes Actions</span>
        </div>

        {loading && auditLogs.length === 0 ? (
          <div className="empty-state">Loading audit history...</div>
        ) : auditLogs.length === 0 ? (
          <div className="empty-state">
            <p>No remediation actions recorded yet.</p>
            <small>When the AI Agent or SRE executes self-healing commands, they will be logged here with cryptographic timestamps.</small>
          </div>
        ) : (
          <table className="audit-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Target Service</th>
                <th>Action</th>
                <th>Executor</th>
                <th>Kubernetes Command</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.map((log, idx) => {
                const statusStr = (log.status || "executed").toLowerCase();
                const isSuccess = statusStr === "success" || statusStr === "executed" || statusStr === "resolved";
                const isAutonomous = (log.executor || "").toLowerCase().includes("agent");

                return (
                  <tr key={idx} className={isSuccess ? "row-success" : "row-fail"}>
                    <td className="timestamp-cell">
                      {log.timestamp ? new Date(log.timestamp).toLocaleString() : "Just now"}
                    </td>
                    <td>
                      <span className="badge badge-info">{log.service || "backend"}</span>
                    </td>
                    <td>
                      <strong>{log.action_key || log.action || "rollout_restart"}</strong>
                    </td>
                    <td>
                      <span className={`executor-pill ${isAutonomous ? "auto" : "human"}`}>
                        {isAutonomous ? "🤖 AI AGENT" : "👤 SRE OPERATOR"}
                      </span>
                    </td>
                    <td className="command-cell">
                      <code>{log.command || "kubectl rollout restart deployment/backend"}</code>
                    </td>
                    <td>
                      <span className={`status-badge ${isSuccess ? "status-success" : "status-danger"}`}>
                        {isSuccess ? "✓ EXECUTED & VERIFIED" : log.status?.toUpperCase() || "PENDING"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
