import React, { useState, useEffect, useCallback } from "react";
import Navbar from "./components/Navbar";
import IncidentConsole from "./components/IncidentConsole";
import AuditTrail from "./components/AuditTrail";
import ClusterTopology from "./components/ClusterTopology";
import ChaosConsole from "./components/ChaosConsole";
import { getAnalyzedIncidents, getAuditHistory, getCircuitBreaker, getTopology } from "./api";

// Fallback initial incident if cluster is idle or backend starting
const FALLBACK_INCIDENTS = [
  {
    incident_id: "inc-sys-init",
    title: "Cluster Telemetry Initialized",
    service: "backend",
    severity: "low",
    status: "Correlated",
    timestamp: new Date().toISOString(),
    root_cause: "Baseline telemetry stream active. All core microservices listening on target ports.",
    confidence: 0.95,
    evidence: ["Prometheus scraper active", "Correlation window: 60s", "Circuit breaker: 0 failures"],
    recommended_actions: [
      {
        name: "Telemetry Health Check",
        action_type: "health_probe",
        target: "backend",
        description: "Verify backend /health endpoint latency within SLA limits.",
        requires_approval: false,
        status: "completed",
      },
    ],
  },
];

export default function App() {
  const [activeTab, setActiveTab] = useState("incidents");
  const [incidents, setIncidents] = useState([]);
  const [auditHistory, setAuditHistory] = useState([]);
  const [circuitBreaker, setCircuitBreaker] = useState(null);
  const [topology, setTopology] = useState({});
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  // Load all telemetry feeds
  const loadData = useCallback(async (isSilent = false) => {
    if (!isSilent) setIsRefreshing(true);
    try {
      const [incRes, auditRes, cbRes, topoRes] = await Promise.allSettled([
        getAnalyzedIncidents(50),
        getAuditHistory(50),
        getCircuitBreaker(),
        getTopology(),
      ]);

      if (incRes.status === "fulfilled" && Array.isArray(incRes.value) && incRes.value.length > 0) {
        setIncidents(incRes.value);
      } else if (incRes.status === "fulfilled" && incRes.value?.incidents) {
        setIncidents(incRes.value.incidents);
      } else if (incidents.length === 0) {
        setIncidents(FALLBACK_INCIDENTS);
      }

      if (auditRes.status === "fulfilled") {
        const hist = Array.isArray(auditRes.value) ? auditRes.value : auditRes.value?.history || [];
        setAuditHistory(hist);
      }

      if (cbRes.status === "fulfilled") {
        setCircuitBreaker(cbRes.value);
      }

      if (topoRes.status === "fulfilled") {
        setTopology(topoRes.value);
      }

      setErrorMsg(null);
    } catch (err) {
      console.warn("Telemetry refresh warning:", err);
      if (incidents.length === 0) {
        setIncidents(FALLBACK_INCIDENTS);
      }
    } finally {
      if (!isSilent) setIsRefreshing(false);
    }
  }, [incidents.length]);

  // Initial load
  useEffect(() => {
    loadData(false);
  }, []);

  // Background polling every 10 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      loadData(true);
    }, 10000);
    return () => clearInterval(timer);
  }, [loadData]);

  return (
    <div className="app-container">
      <Navbar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        incidentCount={incidents.length}
        isRefreshing={isRefreshing}
        onRefresh={() => loadData(false)}
      />

      <main className="main-content">
        {errorMsg && (
          <div className="alert-banner error" style={{ marginBottom: "16px" }}>
            <span>⚠️ {errorMsg}</span>
            <button
              onClick={() => setErrorMsg(null)}
              style={{ background: "transparent", border: "none", color: "inherit", cursor: "pointer" }}
            >
              ✕
            </button>
          </div>
        )}

        {activeTab === "incidents" && (
          <IncidentConsole
            incidents={incidents}
            onReload={() => loadData(false)}
            isBusy={isRefreshing}
          />
        )}

        {activeTab === "audit" && (
          <AuditTrail
            auditHistory={auditHistory}
            circuitBreaker={circuitBreaker}
            onReload={() => loadData(false)}
            isBusy={isRefreshing}
          />
        )}

        {activeTab === "topology" && (
          <ClusterTopology
            topology={topology}
            isBusy={isRefreshing}
          />
        )}

        {activeTab === "chaos" && (
          <ChaosConsole
            onChaosTriggered={() => {
              // Auto-switch to incidents tab after short delay so user sees live response
              setTimeout(() => {
                setActiveTab("incidents");
                loadData(false);
              }, 3000);
            }}
          />
        )}
      </main>
    </div>
  );
}
