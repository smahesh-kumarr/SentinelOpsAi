import React, { useState } from "react";
import { triggerSimLeak, triggerSimSlow, triggerSimCrash } from "../api";

export default function SimConsole({ onSimulationEvent }) {
  const [logs, setLogs] = useState([]);
  const [loadingAction, setLoadingAction] = useState(null);

  const addLog = (msg, type = "info") => {
    const time = new Date().toLocaleTimeString();
    setLogs((prev) => [`[${time}] ${msg}`, ...prev.slice(0, 15)]);
  };

  const handleLeak = async () => {
    setLoadingAction("leak");
    try {
      const res = await triggerSimLeak(20);
      addLog(`Allocated +20MB buffer. Total Leaked: ${res.totalLeakedMB}MB (Chunks: ${res.chunksCount})`, "warn");
      if (onSimulationEvent) onSimulationEvent();
    } catch (err) {
      addLog(`Leak failed: ${err.message}`, "error");
    } finally {
      setLoadingAction(null);
    }
  };

  const handleSlow = async () => {
    setLoadingAction("slow");
    addLog("Sending slow request (3000ms delay)...", "info");
    try {
      const res = await triggerSimSlow(3000);
      addLog(`Slow response received in ${res.elapsedMs}ms`, "warn");
      if (onSimulationEvent) onSimulationEvent();
    } catch (err) {
      addLog(`Slow request failed: ${err.message}`, "error");
    } finally {
      setLoadingAction(null);
    }
  };

  const handleCrash = async () => {
    if (!window.confirm("WARNING: This will immediately kill the backend process (exit code 1). In Kubernetes, this triggers container restart and increases restart count. Continue?")) {
      return;
    }

    setLoadingAction("crash");
    addLog("Simulating backend crash (/simulate/crash)...", "error");
    try {
      await triggerSimCrash();
      addLog("Crash signal dispatched. Backend terminating...", "error");
      if (onSimulationEvent) onSimulationEvent();
    } catch (err) {
      addLog(`Crash trigger error: ${err.message}`, "error");
    } finally {
      setLoadingAction(null);
    }
  };

  return (
    <div className="glass-panel sim-panel">
      <div className="sim-header">
        <div>
          <h2 style={{ fontSize: "1rem", fontWeight: 600 }}>SRE Simulation Console</h2>
          <p style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Telemetry Anomaly Generation</p>
        </div>
        <span className="sim-badge">TESTBED ACTIVE</span>
      </div>

      <div className="sim-actions">
        <div className="sim-card">
          <button
            className="sim-btn sim-btn-leak"
            onClick={handleLeak}
            disabled={loadingAction !== null}
          >
            {loadingAction === "leak" ? "Allocating +20MB..." : "💥 Trigger Memory Leak (+20MB)"}
          </button>
          <p className="sim-desc">
            Retains memory buffers without GC. Triggers Prometheus high memory alert (&gt;90%) and Kubernetes <strong>OOMKilled</strong> when exceeding 200Mi.
          </p>
        </div>

        <div className="sim-card">
          <button
            className="sim-btn sim-btn-slow"
            onClick={handleSlow}
            disabled={loadingAction !== null}
          >
            {loadingAction === "slow" ? "Waiting for response..." : "⏱️ Simulate High Latency (3s)"}
          </button>
          <p className="sim-desc">
            Induces artificial 3-second delay. Visible on Grafana p95 latency graphs and Prometheus <code>http_request_duration_seconds</code>.
          </p>
        </div>

        <div className="sim-card">
          <button
            className="sim-btn sim-btn-crash"
            onClick={handleCrash}
            disabled={loadingAction !== null}
          >
            {loadingAction === "crash" ? "Crashing Process..." : "⚠️ Simulate Service Crash (exit 1)"}
          </button>
          <p className="sim-desc">
            Terminates server immediately. Demonstrates K8s <code>CrashLoopBackOff</code> and pod restart count telemetry for Collector.
          </p>
        </div>
      </div>

      <div style={{ marginTop: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "var(--text-secondary)", marginBottom: "4px" }}>
          <span>Simulation Activity Log</span>
          {logs.length > 0 && (
            <span style={{ cursor: "pointer", color: "var(--text-muted)" }} onClick={() => setLogs([])}>
              Clear
            </span>
          )}
        </div>
        <div className="sim-status-box">
          {logs.length === 0 ? (
            <span style={{ color: "var(--text-muted)" }}>No simulation events triggered yet.</span>
          ) : (
            logs.map((line, idx) => <div key={idx}>{line}</div>)
          )}
        </div>
      </div>
    </div>
  );
}
