import React, { useState, useEffect, useCallback } from "react";
import {
  getIncidents,
  getAnalyzedIncidents,
  triggerAnalysisNow,
  triggerRemediationNow,
  approveAction,
  rejectAction,
} from "../api";

export default function IncidentConsole() {
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [remediating, setRemediating] = useState(false);
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [filterSeverity, setFilterSeverity] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [approvingKey, setApprovingKey] = useState(null);
  const [actionFeedback, setActionFeedback] = useState(null);

  // Fetch incidents from both AI service and correlation engine
  const fetchIncidents = useCallback(async () => {
    try {
      // Prefer analyzed incidents with full RCA & recommendations
      let data = [];
      try {
        const aiData = await getAnalyzedIncidents(50);
        data = aiData.incidents || [];
      } catch {
        // Fallback to correlation engine
        const corrData = await getIncidents(null, 50);
        data = corrData.incidents || [];
      }

      setIncidents(data);
      // Auto-select first incident if none selected
      setSelectedIncident((prev) => {
        if (!prev && data.length > 0) return data[0];
        if (prev) {
          const updated = data.find((i) => (i.id || i._id) === (prev.id || prev._id));
          return updated || data[0] || null;
        }
        return null;
      });
    } catch (err) {
      console.error("Failed to load incidents:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchIncidents();
    const interval = setInterval(fetchIncidents, 6000);
    return () => clearInterval(interval);
  }, [fetchIncidents]);

  const handleTriggerAnalysis = async () => {
    setAnalyzing(true);
    setActionFeedback(null);
    try {
      const res = await triggerAnalysisNow();
      setActionFeedback({
        type: "success",
        msg: `AI Analysis complete: ${res.analyzed_count || 0} incidents analyzed.`,
      });
      await fetchIncidents();
    } catch (err) {
      setActionFeedback({ type: "error", msg: `Analysis failed: ${err.message}` });
    } finally {
      setAnalyzing(false);
    }
  };

  const handleTriggerRemediation = async () => {
    setRemediating(true);
    setActionFeedback(null);
    try {
      const res = await triggerRemediationNow();
      setActionFeedback({
        type: "success",
        msg: `Autonomous Remediation: ${res.executed_count || 0} actions executed.`,
      });
      await fetchIncidents();
    } catch (err) {
      setActionFeedback({ type: "error", msg: `Remediation failed: ${err.message}` });
    } finally {
      setRemediating(false);
    }
  };

  const handleApprove = async (incidentId, actionIdx) => {
    const key = `${incidentId}-${actionIdx}`;
    setApprovingKey(key);
    setActionFeedback(null);
    try {
      const res = await approveAction(incidentId, actionIdx, "human_sre");
      setActionFeedback({
        type: "success",
        msg: `Action approved & executed! Verification: ${res.verification?.message || "Verified healthy"}`,
      });
      await fetchIncidents();
    } catch (err) {
      setActionFeedback({ type: "error", msg: `Approval failed: ${err.message}` });
    } finally {
      setApprovingKey(null);
    }
  };

  const handleReject = async (incidentId, actionIdx) => {
    const key = `${incidentId}-${actionIdx}`;
    setApprovingKey(key);
    setActionFeedback(null);
    try {
      await rejectAction(incidentId, actionIdx, "human_sre", "Rejected from SRE Console");
      setActionFeedback({
        type: "warning",
        msg: "Action rejected. Incident status updated.",
      });
      await fetchIncidents();
    } catch (err) {
      setActionFeedback({ type: "error", msg: `Rejection failed: ${err.message}` });
    } finally {
      setApprovingKey(null);
    }
  };

  // Filtered incidents
  const filtered = incidents.filter((inc) => {
    if (filterSeverity !== "all" && (inc.severity || "").toLowerCase() !== filterSeverity) return false;
    if (filterStatus !== "all" && (inc.status || "").toLowerCase() !== filterStatus) return false;
    return true;
  });

  const criticalCount = incidents.filter((i) => (i.severity || "").toLowerCase() === "critical").length;
  const resolvedCount = incidents.filter((i) => i.status === "resolved").length;
  const openCount = incidents.filter((i) => i.status === "open" || i.status === "in_progress").length;

  return (
    <div className="incident-console-container">
      {/* Top Action & Stat Banner */}
      <div className="console-header glass-panel">
        <div className="header-stats">
          <div className="stat-card">
            <span className="stat-label">Active Incidents</span>
            <span className="stat-val">{incidents.length}</span>
          </div>
          <div className="stat-card critical">
            <span className="stat-label">Critical Alerts</span>
            <span className="stat-val text-danger">{criticalCount}</span>
          </div>
          <div className="stat-card warning">
            <span className="stat-label">Investigating / Open</span>
            <span className="stat-val text-warning">{openCount}</span>
          </div>
          <div className="stat-card success">
            <span className="stat-label">Autonomous Healed</span>
            <span className="stat-val text-success">{resolvedCount}</span>
          </div>
        </div>

        <div className="header-controls">
          <button
            className="btn btn-secondary"
            onClick={fetchIncidents}
            disabled={loading}
            title="Refresh incident list"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            Refresh
          </button>

          <button
            className={`btn btn-accent ${analyzing ? "loading" : ""}`}
            onClick={handleTriggerAnalysis}
            disabled={analyzing}
            title="Force immediate AI Root Cause Analysis cycle"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
            {analyzing ? "Analyzing..." : "Trigger AI RCA"}
          </button>

          <button
            className={`btn btn-primary ${remediating ? "loading" : ""}`}
            onClick={handleTriggerRemediation}
            disabled={remediating}
            title="Run autonomous remediation loop"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
            </svg>
            {remediating ? "Healing..." : "Auto-Remediate"}
          </button>
        </div>
      </div>

      {actionFeedback && (
        <div className={`feedback-banner ${actionFeedback.type}`}>
          <span>{actionFeedback.msg}</span>
          <button className="close-btn" onClick={() => setActionFeedback(null)}>×</button>
        </div>
      )}

      {/* Main Split Layout: Incidents Master-Detail */}
      <div className="incident-grid">
        {/* Left Column: Incidents Stream */}
        <div className="incident-list-panel glass-panel">
          <div className="panel-subhead">
            <h3>Correlated Incident Stream ({filtered.length})</h3>
            <div className="filter-group">
              <select
                value={filterSeverity}
                onChange={(e) => setFilterSeverity(e.target.value)}
                className="filter-select"
              >
                <option value="all">All Severities</option>
                <option value="critical">Critical</option>
                <option value="warning">Warning</option>
                <option value="info">Info</option>
              </select>

              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="filter-select"
              >
                <option value="all">All Statuses</option>
                <option value="open">Open</option>
                <option value="analyzed">Analyzed</option>
                <option value="resolved">Resolved</option>
              </select>
            </div>
          </div>

          <div className="incident-cards-scroll">
            {loading && incidents.length === 0 ? (
              <div className="empty-state">Loading correlated incidents...</div>
            ) : filtered.length === 0 ? (
              <div className="empty-state">
                <p>No incidents matching selected filters.</p>
                <small>Trigger failure scenarios from the Workload tab to see live alerts.</small>
              </div>
            ) : (
              filtered.map((inc) => {
                const incId = inc.id || inc._id;
                const isSelected = selectedIncident && (selectedIncident.id || selectedIncident._id) === incId;
                const sev = (inc.severity || "info").toLowerCase();
                const status = (inc.status || "open").toLowerCase();

                return (
                  <div
                    key={incId}
                    className={`incident-card ${sev} ${isSelected ? "selected" : ""}`}
                    onClick={() => setSelectedIncident(inc)}
                  >
                    <div className="card-top">
                      <span className={`badge badge-${sev}`}>{sev.toUpperCase()}</span>
                      <span className={`status-pill ${status}`}>{status.replace("_", " ")}</span>
                    </div>

                    <h4 className="card-title">{inc.title || "Unknown Incident"}</h4>

                    <div className="card-meta">
                      <span className="meta-item">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
                          <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
                          <line x1="6" y1="6" x2="6.01" y2="6" />
                          <line x1="6" y1="18" x2="6.01" y2="18" />
                        </svg>
                        {inc.service || "backend"}
                      </span>
                      {inc.confidence && (
                        <span className="confidence-badge">
                          {Math.round(inc.confidence)}% Confidence
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Detailed Diagnostic & Action Center */}
        <div className="incident-detail-panel glass-panel">
          {selectedIncident ? (
            <div className="detail-content">
              {/* Incident Header */}
              <div className="detail-header">
                <div>
                  <div className="detail-tags">
                    <span className={`badge badge-${(selectedIncident.severity || "info").toLowerCase()}`}>
                      {(selectedIncident.severity || "info").toUpperCase()}
                    </span>
                    <span className="service-tag">Service: {selectedIncident.service || "backend"}</span>
                    <span className="incident-type-tag">Type: {selectedIncident.incident_type || "generic"}</span>
                  </div>
                  <h2 className="detail-title">{selectedIncident.title}</h2>
                  <span className="timestamp">ID: {selectedIncident.id || selectedIncident._id}</span>
                </div>

                {selectedIncident.confidence && (
                  <div className="confidence-ring">
                    <span className="ring-val">{Math.round(selectedIncident.confidence)}%</span>
                    <span className="ring-label">AI Confidence</span>
                  </div>
                )}
              </div>

              {/* AI Root Cause Diagnosis Section */}
              <div className="detail-section rca-card">
                <div className="section-head">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="16" x2="12" y2="12" />
                    <line x1="12" y1="8" x2="12.01" y2="8" />
                  </svg>
                  <h4>AI Root Cause Analysis & Reasoning</h4>
                </div>
                <div className="rca-body">
                  {selectedIncident.root_cause ? (
                    <p className="rca-text">{selectedIncident.root_cause}</p>
                  ) : (
                    <p className="rca-text text-muted">
                      Pending AI Root Cause diagnosis. Click "Trigger AI RCA" above to synthesize.
                    </p>
                  )}
                </div>
              </div>

              {/* Policy-Governed Recommendations */}
              <div className="detail-section">
                <div className="section-head">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                  <h4>Policy-Governed Remediation Actions ({selectedIncident.recommendations?.length || 0})</h4>
                </div>

                <div className="recommendations-list">
                  {selectedIncident.recommendations && selectedIncident.recommendations.length > 0 ? (
                    selectedIncident.recommendations.map((rec, idx) => {
                      const isAuto = !rec.approval_required;
                      const isExecuted = rec.status === "executed";
                      const isPending = rec.status === "pending" || rec.status === "pending_approval";
                      const key = `${selectedIncident.id || selectedIncident._id}-${idx}`;
                      const isActionBusy = approvingKey === key;

                      return (
                        <div key={idx} className={`rec-card risk-${rec.risk || "low"}`}>
                          <div className="rec-top">
                            <div className="rec-info">
                              <span className={`risk-tag ${rec.risk}`}>Risk: {(rec.risk || "low").toUpperCase()}</span>
                              <span className="rec-action-name">{rec.action}</span>
                            </div>

                            <div className="rec-status-wrap">
                              {isAuto ? (
                                <span className="auto-approved-badge">⚡ Auto-Approved by Agent</span>
                              ) : (
                                <span className="approval-required-badge">🛡️ Human Approval Required</span>
                              )}
                            </div>
                          </div>

                          {rec.suggested_command && (
                            <div className="command-box">
                              <code>{rec.suggested_command}</code>
                            </div>
                          )}

                          {/* Action controls */}
                          <div className="rec-actions-footer">
                            <span className={`execution-status ${rec.status}`}>
                              Status: <strong>{(rec.status || "pending").replace("_", " ").toUpperCase()}</strong>
                            </span>

                            {!isAuto && isPending && (
                              <div className="action-buttons">
                                <button
                                  className="btn btn-sm btn-success"
                                  onClick={() => handleApprove(selectedIncident.id || selectedIncident._id, idx)}
                                  disabled={isActionBusy}
                                >
                                  {isActionBusy ? "Executing..." : "✓ Approve & Execute"}
                                </button>
                                <button
                                  className="btn btn-sm btn-danger"
                                  onClick={() => handleReject(selectedIncident.id || selectedIncident._id, idx)}
                                  disabled={isActionBusy}
                                >
                                  Reject
                                </button>
                              </div>
                            )}

                            {isExecuted && (
                              <span className="verified-badge">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                                Cluster Health Verified
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="empty-substate">
                      No policy actions generated yet. Analysis will recommend targeted remediations.
                    </div>
                  )}
                </div>
              </div>

              {/* Multi-Source Correlated Evidence */}
              <div className="detail-section">
                <div className="section-head">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                  </svg>
                  <h4>Multi-Source Correlated Evidence ({selectedIncident.evidence?.length || 0})</h4>
                </div>

                <div className="evidence-grid">
                  {selectedIncident.evidence && selectedIncident.evidence.length > 0 ? (
                    selectedIncident.evidence.map((ev, eIdx) => (
                      <div key={eIdx} className="evidence-item glass-panel">
                        <div className="evidence-top">
                          <span className={`source-badge ${ev.source}`}>{ev.source?.toUpperCase()}</span>
                          <span className="evidence-sev">{ev.severity || "info"}</span>
                        </div>
                        <pre className="evidence-data">
                          {typeof ev.data === "object" ? JSON.stringify(ev.data, null, 2) : ev.data}
                        </pre>
                      </div>
                    ))
                  ) : (
                    <div className="empty-substate">No raw telemetry evidence attached.</div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="empty-state-large">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              <h3>No Incident Selected</h3>
              <p>Select a correlated incident from the stream to inspect AI diagnosis and recommendations.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
