import React, { useState } from "react";
import { triggerRemediation, simulateAuditEntry } from "../api";

export default function AuditTrail({ auditHistory = [], circuitBreaker = null, onReload, isBusy = false }) {
  const [filterOutcome, setFilterOutcome] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [msg, setMsg] = useState(null);

  // Trigger real remediation cycle via agent
  const handleRunRemediation = async () => {
    setActionLoading(true);
    setMsg({ type: "info", text: "Dispatching autonomous remediation cycle to cluster..." });
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

  // Test simulation to verify ledger functionality immediately
  const handleSimulateTestLog = async () => {
    setActionLoading(true);
    try {
      const res = await simulateAuditEntry("rollout_restart", "backend");
      setMsg({ type: "info", text: `✓ Verified: ${res.message}` });
      if (onReload) onReload();
    } catch (err) {
      setMsg({ type: "error", text: `Simulate audit log failed: ${err.message}` });
    } finally {
      setActionLoading(false);
    }
  };

  const filteredHistory = auditHistory.filter((item) => {
    const outcome = (item.status || item.outcome || "success").toLowerCase();
    const action = (item.action_type || item.action_key || item.action || "").toLowerCase();
    const target = (item.target || item.service || "").toLowerCase();
    const id = (item.incident_id || "").toLowerCase();

    let matchesOutcome = true;
    if (filterOutcome === "success") {
      matchesOutcome = outcome === "success" || outcome === "executed" || outcome === "resolved";
    } else if (filterOutcome === "blocked") {
      matchesOutcome = outcome.includes("block") || outcome.includes("circuit");
    } else if (filterOutcome === "failed") {
      matchesOutcome = outcome === "failed" || outcome === "error";
    } else if (filterOutcome === "pending") {
      matchesOutcome = outcome === "pending" || outcome.includes("approval");
    } else if (filterOutcome === "rejected") {
      matchesOutcome = outcome === "rejected";
    }

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
          flexWrap: "wrap",
          gap: "16px",
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
            Prevents infinite restart loops & deployment thrashing. Max actions: {circuitBreaker?.max_actions || 5}/hr.
            Consecutive failures: {circuitBreaker?.consecutive_failures || 0}.
          </div>
        </div>

        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <button
            className="refresh-btn"
            onClick={handleSimulateTestLog}
            disabled={actionLoading}
            title="Inject a test entry to confirm the ledger is actively receiving records"
          >
            ⚡ Test Ledger Record
          </button>

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
            className="filter-select"
          >
            <option value="all">All Outcomes ({auditHistory.length})</option>
            <option value="success">Success / Executed</option>
            <option value="blocked">Blocked (Circuit Breaker)</option>
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
                  <td colSpan="7" style={{ textAlign: "center", padding: "50px 20px", color: "var(--text-muted)" }}>
                    <div style={{ fontSize: "28px", marginBottom: "8px" }}>📜</div>
                    <div style={{ fontSize: "14px", fontWeight: "600", color: "#f1f5f9" }}>
                      No Remediation Actions In Ledger Yet
                    </div>
                    <div style={{ fontSize: "12.5px", marginTop: "4px", color: "var(--text-muted)" }}>
                      Actions are logged whenever the AI Agent executes a closed-loop self-healing action or an SRE approves a recommendation.
                    </div>
                    <div style={{ marginTop: "16px" }}>
                      <button
                        className="btn-ai"
                        style={{ fontSize: "12px", padding: "8px 16px" }}
                        onClick={handleSimulateTestLog}
                      >
                        ⚡ Simulate Test Action to Verify Ledger
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredHistory.map((item, idx) => {
                  const outcome = (item.status || item.outcome || "success").toLowerCase();
                  let badgeCls = "badge-success";
                  if (outcome === "failed" || outcome === "error") badgeCls = "badge-critical";
                  if (outcome.includes("block") || outcome.includes("circuit")) badgeCls = "badge-critical";
                  if (outcome === "pending" || outcome.includes("approval")) badgeCls = "badge-high";
                  if (outcome === "rejected") badgeCls = "badge-low";

                  const ts = item.timestamp ? new Date(item.timestamp).toLocaleString() : "Just now";
                  const actionName = item.action_type || item.action_key || item.action || "rollout_restart";
                  const executor = item.initiated_by || item.executor || item.approver || "autonomous_agent";
                  const target = item.target || item.service || "backend";
                  const detail = item.details || item.reason || item.message || item.command || (typeof item.result === "object" ? JSON.stringify(item.result) : item.result) || "Executed remediation action via Kubernetes API";

                  return (
                    <tr key={idx}>
                      <td className="mono" style={{ fontSize: "12px", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                        {ts}
                      </td>
                      <td className="mono" style={{ fontSize: "12px", color: "var(--cyan-400)" }}>
                        {item.incident_id || `inc-00${idx + 1}`}
                      </td>
                      <td className="mono" style={{ fontSize: "12.5px", fontWeight: "600" }}>
                        {target}
                      </td>
                      <td style={{ fontWeight: "600" }}>
                        <span className="mono" style={{ color: "#f8fafc" }}>{actionName}</span>
                      </td>
                      <td>
                        <span className="mono" style={{ fontSize: "11px", color: "var(--violet-400)" }}>
                          {executor}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${badgeCls}`}>{outcome}</span>
                      </td>
                      <td style={{ fontSize: "12px", color: "var(--text-secondary)", maxWidth: "340px", lineHeight: "1.4" }}>
                        {detail}
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
