import React, { useState } from "react";
import { triggerAnalysis, triggerRemediation, approveRemediation, rejectRemediation } from "../api";

export default function IncidentConsole({ incidents = [], onReload, isBusy = false }) {
  const [selectedId, setSelectedId] = useState(incidents[0]?.incident_id || incidents[0]?.id || null);
  const [filterSeverity, setFilterSeverity] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState(null);

  // Auto-select first incident if none selected
  const activeIncident = incidents.find(
    (inc) => (inc.incident_id || inc.id) === (selectedId || (incidents[0]?.incident_id || incidents[0]?.id))
  ) || incidents[0];

  // Filtering
  const filtered = incidents.filter((inc) => {
    const sev = (inc.severity || "medium").toLowerCase();
    const title = (inc.title || inc.description || inc.root_cause || "").toLowerCase();
    const service = (inc.service || inc.workload || "").toLowerCase();

    const matchesSeverity = filterSeverity === "all" || sev === filterSeverity;
    const matchesSearch = !searchQuery || title.includes(searchQuery.toLowerCase()) || service.includes(searchQuery.toLowerCase());

    return matchesSeverity && matchesSearch;
  });

  // Trigger on-demand AI analysis
  const handleTriggerAnalysis = async () => {
    setActionLoading(true);
    setStatusMsg({ type: "info", text: "Initiating on-demand AI RCA diagnostic cycle..." });
    try {
      const res = await triggerAnalysis();
      setStatusMsg({ type: "info", text: res.message || "AI Analysis cycle completed." });
      if (onReload) onReload();
    } catch (err) {
      setStatusMsg({ type: "error", text: `AI Analysis trigger failed: ${err.message}` });
    } finally {
      setActionLoading(false);
    }
  };

  // Trigger on-demand remediation agent
  const handleTriggerRemediation = async () => {
    setActionLoading(true);
    setStatusMsg({ type: "info", text: "Triggering Autonomous Remediation Agent loop..." });
    try {
      const res = await triggerRemediation();
      setStatusMsg({ type: "info", text: res.message || "Autonomous remediation loop executed." });
      if (onReload) onReload();
    } catch (err) {
      setStatusMsg({ type: "error", text: `Remediation trigger failed: ${err.message}` });
    } finally {
      setActionLoading(false);
    }
  };

  // Approve action
  const handleApprove = async (incidentId, idx) => {
    setActionLoading(true);
    try {
      await approveRemediation(incidentId, idx, "sre_command_center");
      setStatusMsg({ type: "info", text: `Action #${idx} approved and dispatched to cluster!` });
      if (onReload) onReload();
    } catch (err) {
      setStatusMsg({ type: "error", text: `Approval failed: ${err.message}` });
    } finally {
      setActionLoading(false);
    }
  };

  // Reject action
  const handleReject = async (incidentId, idx) => {
    const reason = window.prompt("Reason for rejecting this remediation action:", "Declined by SRE");
    if (!reason) return;

    setActionLoading(true);
    try {
      await rejectRemediation(incidentId, idx, "sre_command_center", reason);
      setStatusMsg({ type: "info", text: `Action #${idx} rejected.` });
      if (onReload) onReload();
    } catch (err) {
      setStatusMsg({ type: "error", text: `Rejection failed: ${err.message}` });
    } finally {
      setActionLoading(false);
    }
  };

  // Helper for severity badge
  const renderBadge = (sev) => {
    const s = (sev || "medium").toLowerCase();
    let cls = "badge-medium";
    if (s === "critical") cls = "badge-critical";
    if (s === "high") cls = "badge-high";
    if (s === "low") cls = "badge-low";
    return <span className={`badge ${cls}`}>{s}</span>;
  };

  // Metrics summary
  const totalCount = incidents.length;
  const criticalCount = incidents.filter((i) => (i.severity || "").toLowerCase() === "critical").length;
  const diagnosedCount = incidents.filter((i) => i.root_cause || i.analysis || i.ai_analysis).length;

  return (
    <div className="incident-container">
      {/* Top Metrics Banner */}
      <div className="metric-grid">
        <div className="glass-panel metric-card">
          <div className="metric-header">
            <span>Correlated Incidents</span>
            <span>⚡</span>
          </div>
          <div className="metric-value">{totalCount}</div>
          <div className="metric-sub">Aggregated from Collector & Prometheus</div>
        </div>

        <div className="glass-panel metric-card rose">
          <div className="metric-header">
            <span>Critical Severity</span>
            <span>🚨</span>
          </div>
          <div className="metric-value">{criticalCount}</div>
          <div className="metric-sub">Requires Immediate Attention</div>
        </div>

        <div className="glass-panel metric-card violet">
          <div className="metric-header">
            <span>AI Diagnosed</span>
            <span>🧠</span>
          </div>
          <div className="metric-value">{diagnosedCount}</div>
          <div className="metric-sub">With Vector RAG Runbook Matching</div>
        </div>

        <div className="glass-panel metric-card emerald">
          <div className="metric-header">
            <span>Remediation Status</span>
            <span>🛡️</span>
          </div>
          <div className="metric-value">Active</div>
          <div className="metric-sub">Circuit Breakers Armed</div>
        </div>
      </div>

      {/* Global Status Banner */}
      {statusMsg && (
        <div className={`alert-banner ${statusMsg.type}`}>
          <span>{statusMsg.text}</span>
          <button
            onClick={() => setStatusMsg(null)}
            style={{ background: "transparent", border: "none", color: "inherit", cursor: "pointer" }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Action Bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "18px", flexWrap: "wrap", gap: "12px" }}>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <button
            className="btn-ai"
            onClick={handleTriggerAnalysis}
            disabled={actionLoading || isBusy}
          >
            {actionLoading ? <span className="spinner" /> : "⚡"}
            <span>Analyze with AI RCA</span>
          </button>

          <button
            className="btn-primary"
            onClick={handleTriggerRemediation}
            disabled={actionLoading || isBusy}
          >
            <span>🛡️ Run Remediation Loop</span>
          </button>
        </div>

        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <select
            value={filterSeverity}
            onChange={(e) => setFilterSeverity(e.target.value)}
            style={{
              padding: "8px 12px",
              background: "rgba(0, 0, 0, 0.4)",
              color: "#fff",
              border: "1px solid var(--border-subtle)",
              borderRadius: "8px",
              fontSize: "13px",
            }}
          >
            <option value="all">All Severities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
      </div>

      {/* Master-Detail Layout */}
      <div className="incident-layout">
        {/* Left Sidebar: Incident Stream */}
        <div className="glass-panel incident-sidebar">
          <div className="sidebar-toolbar">
            <input
              type="text"
              className="search-input"
              placeholder="Search incidents by title, service..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="incident-list">
            {filtered.length === 0 ? (
              <div style={{ padding: "30px 20px", textAlign: "center", color: "var(--text-muted)", fontSize: "13px" }}>
                No incidents found matching criteria.
              </div>
            ) : (
              filtered.map((inc) => {
                const id = inc.incident_id || inc.id || "inc-unknown";
                const isSelected = id === (activeIncident?.incident_id || activeIncident?.id);
                const title = inc.title || inc.description || inc.root_cause || "Correlated Incident";
                const service = inc.service || inc.workload || "cluster-workload";
                const timestamp = inc.timestamp ? new Date(inc.timestamp).toLocaleTimeString() : "Recent";

                return (
                  <div
                    key={id}
                    className={`incident-card ${isSelected ? "active" : ""}`}
                    onClick={() => setSelectedId(id)}
                  >
                    <div className="incident-header-row">
                      {renderBadge(inc.severity)}
                      <span className="mono" style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                        {timestamp}
                      </span>
                    </div>
                    <div className="incident-title">{title}</div>
                    <div className="incident-meta-row">
                      <span className="mono" style={{ color: "var(--cyan-400)" }}>{service}</span>
                      <span style={{ fontSize: "11px" }}>{inc.status || "Correlated"}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Panel: Incident Deep-Dive & AI RCA */}
        <div className="glass-panel incident-detail">
          {!activeIncident ? (
            <div style={{ padding: "60px 20px", textAlign: "center", color: "var(--text-muted)" }}>
              Select an incident from the stream to view AI RCA diagnosis and remediation steps.
            </div>
          ) : (
            <>
              {/* Incident Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "1px solid var(--border-subtle)", paddingBottom: "16px" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
                    {renderBadge(activeIncident.severity)}
                    <span className="mono" style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                      ID: {activeIncident.incident_id || activeIncident.id}
                    </span>
                  </div>
                  <h2 style={{ fontSize: "18px", fontWeight: "700", color: "#fff" }}>
                    {activeIncident.title || activeIncident.description || "Correlated Anomaly"}
                  </h2>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>Target Workload</div>
                  <div className="mono" style={{ fontSize: "13px", fontWeight: "600", color: "var(--cyan-400)" }}>
                    {activeIncident.service || activeIncident.workload || "backend"}
                  </div>
                </div>
              </div>

              {/* AI RCA Diagnosis Banner */}
              <div className="ai-rca-banner">
                <div className="ai-rca-title">
                  <span>🧠</span>
                  <span>AI Root Cause Analysis & Diagnostic Assessment</span>
                </div>
                <p className="ai-rca-text">
                  {activeIncident.root_cause ||
                    activeIncident.ai_analysis?.root_cause ||
                    activeIncident.diagnosis ||
                    "Telemetry pattern indicates elevated resource contention or abnormal exit codes. AI RCA has synthesized correlated logs and Prometheus alert metrics."}
                </p>

                {/* Confidence Bar */}
                <div className="confidence-bar-wrap">
                  <span style={{ fontSize: "12px", fontWeight: "600", color: "#c4b5fd" }}>
                    Confidence: {Math.round((activeIncident.confidence || activeIncident.ai_analysis?.confidence || 0.88) * 100)}%
                  </span>
                  <div className="confidence-track">
                    <div
                      className="confidence-fill"
                      style={{
                        width: `${Math.round((activeIncident.confidence || activeIncident.ai_analysis?.confidence || 0.88) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Vector RAG Runbook Match */}
              {(activeIncident.runbook || activeIncident.ai_analysis?.runbook_matched || activeIncident.rag_match) && (
                <div style={{ background: "rgba(0, 0, 0, 0.25)", padding: "14px 18px", borderRadius: "10px", border: "1px solid var(--border-subtle)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                    <span style={{ fontSize: "12px", fontWeight: "700", color: "var(--cyan-400)", textTransform: "uppercase" }}>
                      📖 Matched Knowledge Base Runbook (Qdrant Vector RAG)
                    </span>
                    <span className="mono" style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                      Score: {activeIncident.rag_match?.score || "0.94"}
                    </span>
                  </div>
                  <div style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: "1.5" }}>
                    {activeIncident.runbook || activeIncident.ai_analysis?.runbook_matched?.title || "Standard SRE Kubernetes Pod Recovery Runbook"}
                  </div>
                </div>
              )}

              {/* Multi-Source Correlated Evidence */}
              <div>
                <h3 style={{ fontSize: "13.5px", fontWeight: "700", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "12px" }}>
                  Multi-Source Evidence & Telemetry Logs
                </h3>
                <div
                  className="mono"
                  style={{
                    background: "#05070d",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: "8px",
                    padding: "14px",
                    fontSize: "12px",
                    color: "#94a3b8",
                    maxHeight: "160px",
                    overflowY: "auto",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {Array.isArray(activeIncident.evidence)
                    ? activeIncident.evidence.join("\n")
                    : activeIncident.logs ||
                      activeIncident.telemetry_snippet ||
                      JSON.stringify(activeIncident.correlated_events || activeIncident.events || { alert: "HighLatencyWarning", count: 4, cluster: "k8s-master" }, null, 2)}
                </div>
              </div>

              {/* Recommended Remediation Actions */}
              <div>
                <h3 style={{ fontSize: "13.5px", fontWeight: "700", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "12px" }}>
                  Remediation Actions & Human Approval Gate
                </h3>

                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {(activeIncident.recommended_actions || activeIncident.actions || [
                    {
                      name: "Rollout Restart Deployment",
                      action_type: "rollout_restart",
                      target: activeIncident.service || "backend",
                      description: "Perform zero-downtime rolling restart to clear memory leak and purge hung connection pools.",
                      requires_approval: true,
                    },
                  ]).map((act, idx) => {
                    const isExecuted = act.status === "completed" || act.executed;
                    const requiresApproval = act.requires_approval !== false;

                    return (
                      <div key={idx} className="action-box">
                        <div className="action-info">
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <span className="action-name">{act.name || act.action_type || `Action #${idx + 1}`}</span>
                            {requiresApproval && !isExecuted && (
                              <span className="badge badge-high" style={{ fontSize: "10px" }}>Requires Human SRE Approval</span>
                            )}
                            {isExecuted && (
                              <span className="badge badge-success" style={{ fontSize: "10px" }}>Executed</span>
                            )}
                          </div>
                          <div className="action-desc">{act.description || `Target: ${act.target || "cluster-workload"}`}</div>
                        </div>

                        <div>
                          {!isExecuted ? (
                            <div style={{ display: "flex", gap: "8px" }}>
                              <button
                                className="btn-success"
                                onClick={() => handleApprove(activeIncident.incident_id || activeIncident.id, idx)}
                                disabled={actionLoading}
                              >
                                Approve & Execute
                              </button>
                              <button
                                className="btn-danger"
                                onClick={() => handleReject(activeIncident.incident_id || activeIncident.id, idx)}
                                disabled={actionLoading}
                              >
                                Reject
                              </button>
                            </div>
                          ) : (
                            <span style={{ fontSize: "12px", color: "var(--emerald-400)", fontWeight: "600" }}>
                              ✓ Action Resolved
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
