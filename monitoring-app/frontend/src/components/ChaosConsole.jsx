import React, { useState } from "react";
import { triggerSimulation } from "../api";

export default function ChaosConsole({ onChaosTriggered }) {
  const [loadingType, setLoadingType] = useState(null);
  const [feedback, setFeedback] = useState(null);

  const scenarios = [
    {
      id: "crash",
      title: "Pod Crash (CrashLoopBackOff)",
      icon: "💥",
      desc: "Triggers immediate process.exit(1) on the workload backend. Tests Kubernetes pod restart detection and alert correlation.",
      warning: "Pod will restart immediately.",
      params: {},
    },
    {
      id: "cpu",
      title: "High CPU Saturation",
      icon: "📈",
      desc: "Spawns intensive Fibonacci computation loops for 30 seconds to trigger Prometheus container CPU saturation alerts (>80%).",
      warning: "Sustained high load for 30s.",
      params: { duration: 30 },
    },
    {
      id: "memory",
      title: "Memory Leak (OOMKill)",
      icon: "🧠",
      desc: "Allocates large uncollectable byte buffers until container memory limit is reached, simulating leak and OOMKilled events.",
      warning: "May trigger pod OOMKill.",
      params: { mb: 250 },
    },
    {
      id: "slow",
      title: "Latency Degradation Spike",
      icon: "⏱️",
      desc: "Artificially delays backend request processing by 4000ms. Tests SRE p99 latency alert triggers and downstream tracing.",
      warning: "4000ms injected delay.",
      params: { delay: 4000 },
    },
    {
      id: "error",
      title: "500 Internal Error Storm",
      icon: "❌",
      desc: "Forces workload API endpoints to return HTTP 500 internal server errors to validate error-budget and 5xx rate alerts.",
      warning: "Returns HTTP 500 responses.",
      params: { count: 10 },
    },
  ];

  const handleTrigger = async (scenario) => {
    setLoadingType(scenario.id);
    setFeedback({ type: "info", text: `Injecting '${scenario.title}' into workload application...` });

    try {
      const res = await triggerSimulation(scenario.id, scenario.params);
      setFeedback({
        type: "info",
        text: `✓ Chaos injected: ${res.message || res.status || "Triggered successfully"}. Check Incidents & AI RCA tab for automated detection!`,
      });
      if (onChaosTriggered) onChaosTriggered();
    } catch (err) {
      setFeedback({
        type: "error",
        text: `Simulation injection failed: ${err.message}`,
      });
    } finally {
      setLoadingType(null);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Intro Banner */}
      <div className="glass-panel" style={{ padding: "20px 24px", borderLeft: "4px solid var(--rose-500)" }}>
        <h2 style={{ fontSize: "17px", fontWeight: "700", color: "#fff", display: "flex", alignItems: "center", gap: "8px" }}>
          <span>💥</span>
          <span>Chaos Engineering & Fault Injection Testbed</span>
        </h2>
        <p style={{ fontSize: "13.5px", color: "var(--text-secondary)", marginTop: "6px", lineHeight: "1.5" }}>
          Inject controlled synthetic failures directly into the isolated TaskFlow business workload backend (<code className="mono">backend:3000</code>).
          The SentinelOpsAI automated loop will detect the incident, trigger AI RCA diagnosis, and orchestrate closed-loop remediation.
        </p>
      </div>

      {feedback && (
        <div className={`alert-banner ${feedback.type}`}>
          <span>{feedback.text}</span>
          <button
            onClick={() => setFeedback(null)}
            style={{ background: "transparent", border: "none", color: "inherit", cursor: "pointer" }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Scenarios Grid */}
      <div className="chaos-grid">
        {scenarios.map((sc) => {
          const isLoading = loadingType === sc.id;

          return (
            <div key={sc.id} className="glass-panel chaos-card">
              <div>
                <div className="chaos-header">
                  <span className="chaos-icon">{sc.icon}</span>
                  <div>
                    <div className="chaos-title">{sc.title}</div>
                    <div className="mono" style={{ fontSize: "11px", color: "var(--cyan-400)" }}>
                      POST /simulate/{sc.id}
                    </div>
                  </div>
                </div>

                <p className="chaos-desc" style={{ marginTop: "12px" }}>
                  {sc.desc}
                </p>
              </div>

              <div>
                <div style={{ fontSize: "11px", color: "var(--rose-400)", marginBottom: "12px", display: "flex", alignItems: "center", gap: "4px" }}>
                  <span>⚠️</span>
                  <span>{sc.warning}</span>
                </div>

                <button
                  className="btn-danger"
                  style={{ width: "100%", justifyContent: "center", padding: "10px" }}
                  onClick={() => handleTrigger(sc)}
                  disabled={isLoading}
                >
                  {isLoading ? <span className="spinner" /> : "⚡ Fire Chaos Scenario"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
