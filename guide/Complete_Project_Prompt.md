# SentinelOpsAI — Complete Project Prompt

Paste this in full as context before asking any AI coding tool (Antigravity, Claude, ChatGPT, Claude Code) to work on this project. It reflects everything built so far and what's left.

---

## Project Identity

I'm building **SentinelOpsAI** — a final-year engineering project (targeting an IEEE-style research paper) that combines AIOps and SecOps into one intelligent platform for cloud-native applications on Kubernetes.

**What it does:** monitors a sample cloud-native app across four domains — Server, Kubernetes, Application, Security — collects telemetry from real tools, correlates related alerts into a single incident, uses a RAG-grounded LLM to explain root cause and recommend fixes, and lets a policy-controlled AI Agent execute low-risk remediation automatically while gating higher-risk actions behind human approval.

**Core loop:** OBSERVE → COLLECT → CORRELATE → UNDERSTAND (AI/RAG) → RECOMMEND → ACT (Agent) → VERIFY.

**Explicit design decision:** we are NOT training any model. We integrate existing tools (Prometheus, Loki, Falco, Trivy) and an existing LLM API, and build only the correlation/reasoning/orchestration layer ourselves. This is the project's actual research contribution — multi-source telemetry fusion + cross-domain correlation + policy-controlled autonomous remediation — not "we called an LLM."

**Timeline:** hard 9-day build window, deliberately scoped to a minimum-viable prototype: rule-based correlation (not ML), 3 agent actions (not 5), no full self-healing verification loop yet. Do not suggest scope expansions unless asked.

---

## My workflow

- Development on **Windows**, pushed to **GitHub**
- Pulled on a separate **Linux machine** with Docker engine, images built and pushed to **DockerHub**, version-tagged (`v1`, `v2`...)
- Single-node **`kind`/`k3s`** Kubernetes cluster on that same Linux machine — this is a PoC/demo, not production; don't suggest multi-node or cloud-managed K8s
- App namespace: `sentinelopsai`. Monitoring stack: `monitoring`. Falco: `falco`.
- Tools in play: Antigravity (VS Code extension) for dev/Collector/Correlation Engine work, Claude/ChatGPT for monitoring-stack deployment guidance and architecture decisions

---

## Build Status

| # | Component | Status | Key facts |
|---|---|---|---|
| 1 | Frontend | Built | React, env-configured API URL, never hardcoded |
| 2 | Backend | Built | Express.js + Postgres, `/health`, `prom-client` at `/metrics`, centralized structured JSON logger, `/simulate/leak|slow|crash` gated by `ENABLE_TEST_ROUTES` |
| 3 | Containerization | Built | Multi-stage Dockerfiles, DockerHub, version-tagged, `build.sh` loop script |
| 4 | K8s Deployment | Built | Deployment+Service per app service, ConfigMap (non-sensitive) / Secret (sensitive, created via `kubectl create secret`), readiness+liveness on `/health`, backend memory limit deliberately low (~200Mi) for OOMKilled demos |
| 5 | Monitoring | Built | `kube-prometheus-stack` via Helm. Backend scraped via **ServiceMonitor** (not annotations — this chart needs Prometheus Operator CRDs), labeled `release: monitoring`, backend Service port must be **named** |
| 6 | Logging | Built | `loki-stack` via Helm (Grafana disabled in this chart to avoid duplicate instance), Promtail auto-tails logs, Loki added as Grafana data source, Promtail pipeline stage parses structured JSON so `level`/`service` are queryable |
| 7 | Security | Built | Falco via Helm, `driver.kind=modern_ebpf` (required — default driver fails in `kind`/containerized nodes), falcosidekick forwards alerts to Collector's `/events/falco` webhook |
| 8 | Collector Service | Built | Python/FastAPI, in-cluster, single replica, read-only RBAC ServiceAccount, polls Prometheus + Loki every 30s (`apscheduler`), receives Falco pushes, polls K8s API for restart counts, writes normalized `events` table in Postgres |
| 9 | Correlation Engine | Built | Python/FastAPI, in-cluster, reads `events` directly from same Postgres, ordered rule functions (most-specific first), writes `incidents` table, duplicate-suppression cooldown |
| 10 | AI Service + RAG | Built | Python/FastAPI, in-cluster, Qdrant vector DB (Helm), knowledge base of markdown runbooks embedded with `BAAI/bge-m3`, polls incidents with `root_cause IS NULL`, retrieves top-k docs, calls LLM API, writes `root_cause`/`confidence`/`recommendations` back |
| 10b | Recommendation Engine | Built | Folded into AI Service — `policy_map.py` maps free-text actions → risk level + `kubectl` command template + `approval_required`; unrecognized actions default to advisory-only |
| 11 | AI Agent | **Not built yet** | Needs write-scoped RBAC (Deployments only: get/patch/update), auto-executes `approval_required: false` recommendations, holds others for a dashboard approval click, verifies outcome after executing |
| 12 | Dashboard | **Not built yet** | React page rendering AI Service's `/incidents` — incident, evidence, severity, root cause, confidence, recommendations, agent status |

**Shared database convention:** Collector, Correlation Engine, and AI Service all connect to the **same Postgres instance** and read/write shared tables (`events`, `incidents`) directly rather than hopping through HTTP between services. Each keeps its own `models.py` copy, manually kept in sync — no Alembic migrations yet (known limitation, to be noted honestly in the report, not hidden).

---

## Conventions that must not be silently changed

1. Every service exposes `/health` → `{"status":"ok"}`, used for K8s probes
2. Non-sensitive config → ConfigMap. Sensitive (DB URL, API keys, JWT secret) → Secret, created via `kubectl create secret`, never committed with real values
3. Structured JSON logs everywhere: `{level, msg, service, timestamp}` — never plain-text `console.log`
4. All app services single-replica unless there's a specific reason to scale (avoids duplicate-processing bugs, especially in pollers/correlators)
5. RBAC is scoped minimally per service: Collector = read-only, future Agent = write-only on Deployments — nothing gets cluster-admin
6. Backend's memory limit stays deliberately low — this is intentional for demo scenarios, not a bug to fix
7. LLM responses are parsed as strict JSON with markdown-fence stripping; malformed responses are caught and logged, never allowed to crash the polling loop

---

## What I need help with right now

**[Fill in for the specific task you're handing off — e.g.:]**

> Build the AI Agent service (Phase 11): reads incidents where `status = "analyzed"`, for each recommendation with `approval_required: false` executes the `suggested_command`'s equivalent action via the Python `kubernetes` client (in-cluster config, not shelling out to `kubectl`), updates that recommendation's `status` to `"executed"`, and re-checks the original trigger condition after a short delay to mark it `resolved` or `unresolved`. For `approval_required: true` recommendations, expose a `POST /approve/{incident_id}/{action_index}` endpoint for a future dashboard button to call before executing.

---

## Ground rules

1. Don't rename existing services, tables, columns, or env vars without flagging it — three services already depend on the current schema
2. Follow existing patterns (structured logging, `/health`, ConfigMap/Secret split, scoped RBAC) for anything new rather than inventing new conventions
3. If a design decision is ambiguous (retry logic, exact thresholds, etc.), ask rather than assume — this project intentionally uses documented, explainable thresholds rather than ML black-boxes, which matters for the research framing
4. Keep everything minimal-but-correct given the 9-day timeline — no gold-plating, no unrequested scope expansion
