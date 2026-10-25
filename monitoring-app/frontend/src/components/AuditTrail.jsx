import React, { useState } from "react";
import { triggerRemediation } from "../api";

export default function AuditTrail({ auditHistory = [], circuitBreaker = null, onReload, isBusy = false }) {
  const [filterOutcome, setFilterOutcome] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [msg, setMsg] = useState(null);

  const handleRunRemediation = async () => {
    setActionLoading(true);
    try {
      const res = await triggerRemediation();
      setMsg({ type: "info", text: res.message || "Autonomous remediation loop completed." });
      if (onReload) onReload();
    } catch (err) {
      setMsg({ type: "error", text: `Remediation execution failed: ${err.message}` });
    } finally {
      setActionLoading(false);
    }
  };

  const filteredHistory = auditHistory.filter((item) => {
    const outcome = (item.status || item.outcome || "success").toLowerCase();
    const action = (item.action_type || item.action || "").toLowerCase();
    const target = (item.target || item.service || "").toLowerCase();
    const id = (item.incident_id || "").toLowerCase();

    const matchesOutcome = filterOutcome === "all" || outcome === filterOutcome;
    const matchesSearch =
      !searchTerm ||
      action.includes(searchTerm.toLowerCase()) ||
      target.includes(searchTerm.toLowerCase()) ||
      id.includes(searchTerm.toLowerCase());

    return matchesOutcome && matchesSearch;
  });

  const isTripped = circuitBreaker?.tripped || circuitBreaker?.status === "tripped";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* Circuit Breaker Banner */}
      <div
        className="glass-panel"
        style={{
          padding: "18px 24px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderLeft: `4px solid ${isTripped ? "var(--rose-500)" : "var(--emerald-500)"}`,
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
            <span style={{ fontSize: "18px" }}>{isTripped ? "⚠️" : "🛡️"}</span>
            <span style={{ fontSize: "15px", fontWeight: "700", color: "#fff" }}>
              Remediation Safety Circuit Breaker: {isTripped ? "TRIPPED (PAUSED)" : "ARMED & ACTIVE"}
            </span>
            <span className={`badge ${isTripped ? "badge-critical" : "badge-success"}`}>
              {isTripped ? "Halted" : "Healthy"}
            </span>
          </div>
          <div style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
            Prevents remediation loops and cascading restarts. Max actions: {circuitBreaker?.max_actions || 5}/hr.
            Consecutive failures: {circuitBreaker?.consecutive_failures || 0}.
          </div>
        </div>

        <div>
          <button
            className="btn-primary"
            onClick={handleRunRemediation}
            disabled={actionLoading || isBusy || isTripped}
          >
            {actionLoading ? <span className="spinner" /> : "⚡"}
            <span>Trigger Remediation Cycle</span>
          </button>
        </div>
      </div>

      {msg && (
        <div className={`alert-banner ${msg.type}`}>
          <span>{msg.text}</span>
          <button
            onClick={() => setMsg(null)}
            style={{ background: "transparent", border: "none", color: "inherit", cursor: "pointer" }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
        <input
          type="text"
          className="search-input"
          placeholder="Search audit trail by action, target workload, incident ID..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ maxWidth: "380px" }}
        />

        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <select
            value={filterOutcome}
            onChange={(e) => setFilterOutcome(e.target.value)}
            style={{
              padding: "8px 12px",
              background: "rgba(0, 0, 0, 0.4)",
              color: "#fff",
              border: "1px solid var(--border-subtle)",
              borderRadius: "8px",
              fontSize: "13px",
            }}
          >
            <option value="all">All Outcomes</option>
            <option value="success">Success / Executed</option>
            <option value="failed">Failed</option>
            <option value="pending">Pending Approval</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
      </div>

      {/* Audit History Ledger Table */}
      <div className="glass-panel" style={{ padding: "8px", overflow: "hidden" }}>
        <div className="audit-table-wrap">
          <table className="audit-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Incident ID</th>
                <th>Target Resource</th>
                <th>Remediation Action</th>
                <th>Initiator</th>
                <th>Outcome</th>
                <th>Execution Details</th>
              </tr>
            </thead>
            <tbody>
              {filteredHistory.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: "center", padding: "40px 20px", color: "var(--text-muted)" }}>
                    No remediation actions recorded in audit ledger yet.
                  </td>
                </tr>
              ) : (
                filteredHistory.map((item, idx) => {
                  const outcome = (item.status || item.outcome || "success").toLowerCase();
                  let badgeCls = "badge-success";
                  if (outcome === "failed") badgeCls = "badge-critical";
                  if (outcome === "pending") badgeCls = "badge-high";
                  if (outcome === "rejected") badgeCls = "badge-low";

                  const ts = item.timestamp ? new Date(item.timestamp).toLocaleString() : "Just now";

                  return (
                    <tr key={idx}>
                      <td className="mono" style={{ fontSize: "12px", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                        {ts}
                      </td>
                      <td className="mono" style={{ fontSize: "12px", color: "var(--cyan-400)" }}>
                        {item.incident_id || `inc-00${idx + 1}`}
                      </td>
                      <td className="mono" style={{ fontSize: "12.5px", fontWeight: "600" }}>
                        {item.target || item.service || "backend"}
                      </td>
                      <td style={{ fontWeight: "600" }}>
                        {item.action_type || item.action || "rollout_restart"}
                      </td>
                      <td>
                        <span className="mono" style={{ fontSize: "11px", color: "var(--violet-400)" }}>
                          {item.initiated_by || item.approver || "autonomous_agent"}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${badgeCls}`}>{outcome}</span>
                      </td>
                      <td style={{ fontSize: "12px", color: "var(--text-secondary)", maxWidth: "300px" }}>
                        {item.details || item.reason || item.message || "Executed rollout restart via Kubernetes API"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
