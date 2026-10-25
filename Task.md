# SentinelOpsAI — Master Task Plan (Phases 1–4)

This task document outlines the exact implementation, containerization, deployment, and monitoring milestones for the **SentinelOpsAI** platform based on [`Complete_Project_Prompt.md`](file:///c:/Users/mahes/OneDrive/Documents/Desktop/SentinelOpsAi/guide/Complete_Project_Prompt.md) and [`detailed_guide.md`](file:///c:/Users/mahes/OneDrive/Documents/Desktop/SentinelOpsAi/guide/detailed_guide.md).

---

## 🎯 Target Goals Overview

| Milestone | Phase | Scope & Key Deliverables |
| :--- | :--- | :--- |
| **Goal 1** | **Development Phase** | Express.js backend (`prom-client`, structured logger, `/health`, `/simulate/*`), React/Vite frontend (env-configured API), and initial Collector Service scaffold (FastAPI + Pydantic). |
| **Goal 2** | **Containerization** | Production-ready, multi-stage Dockerfiles for backend, frontend, and collector service; `.dockerignore` files; automated build and push scripts. |
| **Goal 3** | **Kubernetes Deployment** | `kind`/`k3s` cluster setup, `sentinelopsai` namespace, ConfigMaps, Secret creation patterns, Deployments (deliberate 200Mi memory limit, health probes), and Services with **named ports**. |
| **Goal 4** | **Prometheus & Grafana** | `kube-prometheus-stack` Helm deployment in `monitoring` namespace, Prometheus Operator `ServiceMonitor` CRD, target discovery, and custom dashboards. |

---

## ⚠️ Non-Negotiable Architectural Rules

1. **Named Service Ports**: The backend Kubernetes Service port **must be named** (e.g., `name: "3000"` or `name: "http-metrics"`) so the Prometheus Operator `ServiceMonitor` can discover and scrape endpoints.
2. **ServiceMonitor Label Match**: The `ServiceMonitor` must include the label `release: monitoring` to match the Helm release name of `kube-prometheus-stack`, otherwise Prometheus will ignore it.
3. **Deliberate Memory Limit**: The backend container memory limit must remain deliberately low (**`200Mi`**, with request at `128Mi`). This is an intentional design choice for triggering `OOMKilled` demonstration scenarios.
4. **Structured JSON Logging**: Every log entry across backend and python services must be formatted as structured JSON: `{"level": "info|warn|error", "msg": "...", "service": "...", "timestamp": "..."}`. Plain text `console.log` is forbidden.
5. **Config Separation**: Non-sensitive variables (`PORT`, `NODE_ENV`, `LOG_LEVEL`) go into ConfigMaps. Sensitive variables (`DATABASE_URL`, `JWT_SECRET`) are created via `kubectl create secret` and never committed in plaintext.
6. **Docker Binding**: Python/FastAPI services must bind to `--host 0.0.0.0`, never default `127.0.0.1`.

---

## 📋 Detailed Task Breakdown

```
SentinelOpsAi/
├── backend/
│   ├── package.json
│   ├── server.js
│   ├── metrics.js
│   ├── logger.js
│   ├── routes/
│   │   ├── health.js
│   │   └── simulate.js
│   ├── Dockerfile
│   └── .dockerignore
├── frontend/
│   ├── package.json
│   ├── vite.config.js
│   ├── src/
│   ├── Dockerfile
│   ├── nginx.conf
│   └── .dockerignore
├── collector-service/
│   ├── requirements.txt
│   ├── main.py
│   ├── schemas.py
│   ├── Dockerfile
│   └── .dockerignore
├── k8s/
│   ├── 00-namespace.yaml
│   ├── mongodb/
│   │   ├── mongodb-deployment.yaml
│   │   └── mongodb-service.yaml
│   ├── backend/
│   │   ├── backend-configmap.yaml
│   │   ├── backend-deployment.yaml
│   │   └── backend-service.yaml
│   ├── frontend/
│   │   ├── frontend-deployment.yaml
│   │   └── frontend-service.yaml
│   └── monitoring/
│       └── backend-servicemonitor.yaml
└── scripts/
    ├── build.sh
    └── build.ps1
```

---

### Phase 1: Development Phase (ToDo / Task Manager App with MongoDB) — COMPLETED ✅

#### 1.1 Backend Service (`backend/`)
- [x] Initialize Node.js project (`package.json`) with dependencies: `express`, `prom-client`, `cors`, `dotenv`, `mongodb`.
- [x] Create structured JSON logger (`backend/logger.js`):
  - Output fields: `{ level, msg, service: "backend", timestamp, ...extra }`.
  - Methods: `info()`, `warn()`, `error()`.
- [x] Implement Prometheus metrics module (`backend/metrics.js`):
  - Initialize `prom-client.Registry()`.
  - Collect standard default metrics (`collectDefaultMetrics`).
  - Create counter: `http_requests_total` with labels `['method', 'route', 'status_code']`.
  - Create histogram: `http_request_duration_seconds` with buckets `[0.05, 0.1, 0.3, 0.5, 1, 2, 5]` and labels `['method', 'route', 'status_code']`.
  - Register middleware to intercept all requests and record count and duration with route normalization.
  - Expose `/metrics` endpoint serving raw Prometheus exposition format.
- [x] Implement Health endpoint (`backend/routes/health.js`):
  - `GET /health` returning `{"status": "ok", "service": "backend", "uptime": ..., "mongoConnected": ...}` with HTTP 200.
- [x] Implement ToDo / Task Manager CRUD routes (`backend/routes/todos.js`):
  - `GET /api/todos`, `POST /api/todos`, `PUT /api/todos/:id`, `DELETE /api/todos/:id`.
  - Backed by `backend/db.js` using official MongoDB driver (`MongoClient`) with normalized `id` and fallback in-memory store for resilience.
- [x] Implement Failure Simulation routes (`backend/routes/simulate.js`):
  - Gate routes behind environment variable `ENABLE_TEST_ROUTES=true`.
  - `GET /simulate/leak`: Appends chunks of memory to a global array on every call without garbage collection to trigger high memory and eventually `OOMKilled`.
  - `GET /simulate/slow`: Induces artificial delay (e.g., 3000ms) to simulate high latency and CPU spikes.
  - `GET /simulate/crash`: Exits process with code 1 after 250ms to trigger container restarts and `CrashLoopBackOff`.
  - `GET /simulate/status`: Returns current memory leakage statistics.
- [x] Assemble `backend/server.js` bringing together logger, metrics, health, simulation routes, and sample API endpoints.
- [x] Provide `.env.example` and `.gitignore`.

#### 1.2 Frontend Service (`frontend/`)
- [x] Initialize React application using Vite.
- [x] Configure environment variable handling for API connection (`VITE_API_URL` via `import.meta.env.VITE_API_URL`), ensuring the backend address is never hardcoded.
- [x] Implement Task Manager interface with modern dark-mode glassmorphic styling:
  - Task creation form with priority selection (Low, Medium, High).
  - Task list with status filters (All, Active, Completed), keyword search, toggle complete, and deletion.
  - Metrics summary bar (Total tasks, Pending, Completed, Leaked Memory).
- [x] Implement SRE Simulation Console dock (`frontend/src/components/SimConsole.jsx`):
  - Backend connection status & latency monitor.
  - Interactive triggers for `/simulate/leak`, `/simulate/slow`, and `/simulate/crash`.
  - Live activity logging for simulation triggers.
- [x] Configure `vite.config.js`, `.env.example`, and `.gitignore`.

#### 1.3 Collector Service Scaffold (`collector-service/`)
- [x] Initialize Python FastAPI project with `requirements.txt` (`fastapi`, `uvicorn`, `pydantic`).
- [x] Create Pydantic data contract (`collector-service/schemas.py`):
  ```python
  class EventIn(BaseModel):
      source: str
      service: str
      severity: Optional[str] = None
      data: dict
  ```
- [x] Create FastAPI application stub (`collector-service/main.py`):
  - Structured JSON logger for ingestion events.
  - `GET /health` returning `{"status": "ok", "service": "collector"}`.
  - `POST /events` validating incoming `EventIn` schema and returning `{"status": "accepted"}`.
- [x] Verify validation: Rejects payloads missing required fields with HTTP 422 Unprocessable Entity.

#### Phase 1 Verification Checklist (Verified & Passed):
- [x] `curl http://localhost:3000/health` returns `{"status":"ok"}`.
- [x] `curl http://localhost:3000/metrics` returns standard process metrics and `http_requests_total`.
- [x] `curl http://localhost:3000/simulate/leak` allocates memory and confirms simulation trigger.
- [x] Frontend builds cleanly with Vite (`npm run build`) and connects via `VITE_API_URL`.
- [x] `curl -X POST http://localhost:8000/events -H "Content-Type: application/json" -d "{}"` returns 422.
- [x] `POST http://localhost:8000/events` with valid `EventIn` returns 200 and logs structured JSON.
- [x] All code committed with `.env` gitignored.

---

### Phase 2: Containerization — COMPLETED ✅

#### 2.1 Backend Containerization (`backend/Dockerfile`)
- [x] Configure `.dockerignore` (`node_modules`, `.env`, `.git`, `*.log`).
- [x] Write multi-stage Dockerfile:
  - Stage 1 (`builder`): Node 20 Alpine, copy `package*.json`, install dependencies with `npm ci --only=production`.
  - Stage 2 (`runner`): Node 20 Alpine, copy production build from builder, expose port `3000`, set `NODE_ENV=production`, execute `CMD ["node", "server.js"]`.
- [x] Enhanced CORS configuration in `server.js` with explicit methods, headers, and preflight `OPTIONS` routing for Kubernetes ingress/service access.

#### 2.2 Frontend Containerization (`frontend/Dockerfile`)
- [x] Configure `.dockerignore` (`node_modules`, `dist`, `.env`, `.git`).
- [x] Create custom `nginx.conf` supporting Single Page Application routing (fallback to `index.html`) and built-in reverse proxy routing `/api/`, `/health`, `/simulate/` directly to K8s internal backend service (`http://backend:3000`).
- [x] Update `frontend/src/api.js` to automatically utilize same-origin reverse proxy when containerized in production, avoiding cross-origin issues completely.
- [x] Write multi-stage Dockerfile:
  - Stage 1 (`builder`): Node 20 Alpine, accept `ARG VITE_API_URL`, set `ENV VITE_API_URL=$VITE_API_URL`, run `npm ci` and `npm run build`.
  - Stage 2 (`webserver`): Nginx Alpine, copy build artifacts from `/app/dist` to `/usr/share/nginx/html`, copy `nginx.conf`, expose port `80`.

#### 2.3 Collector Service Containerization (`collector-service/Dockerfile`)
- [x] Configure `.dockerignore` (`__pycache__`, `.venv`, `venv`, `.env`, `.git`).
- [x] Write Dockerfile:
  - Base: `python:3.11-slim`.
  - Install dependencies via `pip install --no-cache-dir -r requirements.txt`.
  - Expose port `8000`.
  - Execute `CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]`.

#### 2.4 Build and Automation Scripts
- [x] Create Linux build script `scripts/build.sh`:
  - Parameterized image tagging (`<registry>/sentinelops-<service>:<version>`).
  - Builds and pushes: `backend`, `frontend`, `collector-service`.
- [x] Create Windows PowerShell build script `scripts/build.ps1` for local parity.

#### Phase 2 Verification Checklist:
- [x] Multi-stage Dockerfiles verified for backend, frontend, and collector service.
- [x] Frontend Nginx reverse proxy configuration tested and verified with Vite build (`npm run build`).
- [x] Permissive CORS preflight handler integrated into backend server.
- [x] Build scripts prepared for Linux Docker VM deployment.

---

### Phase 3: Kubernetes Deployment — MANIFESTS READY 📦

#### 3.1 Cluster & Namespace Setup
- [x] Create dedicated namespace manifest `k8s/00-namespace.yaml` for `sentinelopsai`.

#### 3.2 Database Deployment (MongoDB)
- [x] Create MongoDB Deployment manifest (`k8s/mongodb/mongodb-deployment.yaml`) with TCP socket health probes and volume mount.
- [x] Create MongoDB Service manifest (`k8s/mongodb/mongodb-service.yaml`) exposing port `27017` on name `mongodb`.

#### 3.3 Configuration & Secrets
- [x] Create non-sensitive ConfigMap `k8s/backend/backend-configmap.yaml`:
  - `PORT: "3000"`, `NODE_ENV: "production"`, `LOG_LEVEL: "info"`, `ENABLE_TEST_ROUTES: "true"`, `MONGODB_DB_NAME: "sentinelops"`.
- [x] Idempotent Secret creation script logic in `scripts/deploy-k8s.sh` and `scripts/deploy-k8s.ps1` for `backend-secrets` (`MONGODB_URI`, `JWT_SECRET`).

#### 3.4 Backend Deployment & Service
- [x] Create Backend Deployment `k8s/backend/backend-deployment.yaml`:
  - `replicas: 2`.
  - Image: `maheshkumars772/sentinelops-backend:v1`.
  - Resources: `requests: { memory: "128Mi", cpu: "100m" }`, `limits: { memory: "200Mi", cpu: "300m" }` (**CRITICAL: Intentionally constrained for OOM demos**).
  - Probes: Readiness (`/health`, 3000), Liveness (`/health`, 3000).
  - Environment injection: `envFrom` referencing `backend-config` and `backend-secrets`.
- [x] Create Backend Service `k8s/backend/backend-service.yaml`:
  - Type: `ClusterIP`.
  - Explicit named port: `name: "3000"`, `port: 3000`, `targetPort: 3000` (required for Prometheus `ServiceMonitor`).

#### 3.5 Frontend & Collector Deployments & Services
- [x] Create Frontend Deployment `k8s/frontend/frontend-deployment.yaml` (`maheshkumars772/sentinelops-frontend:v1`).
- [x] Create Frontend Service `k8s/frontend/frontend-service.yaml` (NodePort `30080`, port `80`).
- [x] Create Collector Deployment `k8s/collector/collector-deployment.yaml` (`maheshkumars772/sentinelops-collector-service:v1`).
- [x] Create Collector Service `k8s/collector/collector-service.yaml` (ClusterIP, port `8000`).

#### 3.6 Automated Rollout Automation
- [x] Create Linux rollout script [`scripts/deploy-k8s.sh`](file:///c:/Users/mahes/OneDrive/Documents/Desktop/SentinelOpsAi/scripts/deploy-k8s.sh).
- [x] Create Windows PowerShell rollout script [`scripts/deploy-k8s.ps1`](file:///c:/Users/mahes/OneDrive/Documents/Desktop/SentinelOpsAi/scripts/deploy-k8s.ps1).

#### Phase 3 Verification Checklist:
- [x] `kubectl apply -f k8s/00-namespace.yaml`.
- [x] `kubectl apply -f k8s/backend/` and `k8s/frontend/`.
- [x] `kubectl get pods -n sentinelopsai -w` reaches `Running` state and passes probes (2/2 ready).
- [x] Port-forward backend: `kubectl port-forward svc/backend -n sentinelopsai 3000:3000` -> `curl localhost:3000/health` returns `200 OK`.
- [x] Port-forward frontend: NodePort `30080` / `kubectl port-forward svc/frontend -n sentinelopsai 8080:80` -> browser renders dashboard.

---

### Phase 4: Monitoring (Prometheus & Grafana) — MANIFESTS & SCRIPTS READY 📊

#### 4.1 Deploy `kube-prometheus-stack`
- [x] Helm repository and deployment automation encapsulated in [`scripts/deploy-monitoring.sh`](file:///c:/Users/mahes/OneDrive/Documents/Desktop/SentinelOpsAi/scripts/deploy-monitoring.sh).
- [x] Dedicated `monitoring` namespace rollout with sidecar dashboard discovery (`grafana.sidecar.dashboards.searchNamespace=ALL`).

#### 4.2 Configure Prometheus Scrape via ServiceMonitor CRD
- [x] Create ServiceMonitor manifest [`k8s/monitoring/backend-servicemonitor.yaml`](file:///c:/Users/mahes/OneDrive/Documents/Desktop/SentinelOpsAi/k8s/monitoring/backend-servicemonitor.yaml):
  - Label: `release: monitoring` (matches Helm release name).
  - Selector: `app: backend` in namespace `sentinelopsai`.
  - Port: `"3000"` (matches backend service named port).
  - Path: `/metrics`, scrape interval: `15s`.

#### 4.3 Configure Grafana Dashboards
- [x] Create custom Grafana Dashboard ConfigMap [`k8s/monitoring/sentinelops-grafana-dashboard.yaml`](file:///c:/Users/mahes/OneDrive/Documents/Desktop/SentinelOpsAi/k8s/monitoring/sentinelops-grafana-dashboard.yaml) with label `grafana_dashboard: "1"`.
- [x] Pre-configured panels:
  1. **HTTP Request Throughput**: `sum(rate(http_requests_total{namespace="sentinelopsai"}[1m])) by (status_code, route)`
  2. **P95 Latency**: `histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket{namespace="sentinelopsai"}[5m])) by (le))`
  3. **Backend Memory vs 200Mi Limit**: `sum(container_memory_working_set_bytes{namespace="sentinelopsai", container="backend"}) by (pod)` with thresholds at 180Mi (90% warning) and 200Mi (OOM limit).
  4. **Pod Restart Counter**: `increase(kube_pod_container_status_restarts_total{namespace="sentinelopsai", container="backend"}[1h])`

#### 4.4 Rollout & Teardown Automation
- [x] Create Linux monitoring rollout script [`scripts/deploy-monitoring.sh`](file:///c:/Users/mahes/OneDrive/Documents/Desktop/SentinelOpsAi/scripts/deploy-monitoring.sh).
- [x] Create Linux monitoring teardown script [`scripts/undeploy-monitoring.sh`](file:///c:/Users/mahes/OneDrive/Documents/Desktop/SentinelOpsAi/scripts/undeploy-monitoring.sh).
- [x] Create Windows PowerShell rollout and teardown scripts (`scripts/deploy-monitoring.ps1`, `scripts/undeploy-monitoring.ps1`).

#### Phase 4 Verification Checklist:
- [x] Run `./scripts/deploy-monitoring.sh` on Ubuntu VM.
- [x] Verify Prometheus Operator, Alertmanager, Node Exporter, and Grafana are Running (`kubectl get pods -n monitoring`).
- [x] Verify Prometheus Target `backend-monitor` is **UP** at `http://localhost:9090/targets`.
- [x] Access Grafana at `http://localhost:3001` and open pre-loaded `SentinelOpsAI — SRE Observability Dashboard`.
- [x] Trigger `/simulate/leak` and observe memory curve rise towards 200Mi limit.

---

### Phase 5: Centralized Logging (Loki + Promtail) — MANIFESTS & SCRIPTS READY 🪵

#### 5.1 Deploy `loki-stack` via Helm
- [x] Custom Helm values [`k8s/logging/promtail-values.yaml`](file:///c:/Users/mahes/OneDrive/Documents/Desktop/SentinelOpsAi/k8s/logging/promtail-values.yaml) with `grafana.enabled: false`, `promtail.enabled: true`, and JSON pipeline stages.
- [x] Rollout automation script [`scripts/deploy-logging.sh`](file:///c:/Users/mahes/OneDrive/Documents/Desktop/SentinelOpsAi/scripts/deploy-logging.sh) deploying into `monitoring` namespace.

#### 5.2 Configure Grafana Loki DataSource
- [x] Create DataSource ConfigMap [`k8s/logging/grafana-loki-datasource.yaml`](file:///c:/Users/mahes/OneDrive/Documents/Desktop/SentinelOpsAi/k8s/logging/grafana-loki-datasource.yaml) labeled `grafana_datasource: "1"` pointing to `http://loki.monitoring.svc.cluster.local:3100`.

#### 5.3 Configure Promtail Structured JSON Pipeline
- [x] Promtail pipeline configured to extract `level`, `service`, `msg` and promote `level` and `service` into indexed Loki labels.

#### 5.4 Rollout & Teardown Automation
- [x] Create Linux logging deployment script [`scripts/deploy-logging.sh`](file:///c:/Users/mahes/OneDrive/Documents/Desktop/SentinelOpsAi/scripts/deploy-logging.sh).
- [x] Create Linux logging teardown script [`scripts/undeploy-logging.sh`](file:///c:/Users/mahes/OneDrive/Documents/Desktop/SentinelOpsAi/scripts/undeploy-logging.sh).
- [x] Create Windows PowerShell deployment and teardown scripts (`scripts/deploy-logging.ps1`, `scripts/undeploy-logging.ps1`).

#### Phase 5 Verification Checklist:
- [x] Run `./scripts/deploy-logging.sh` on Ubuntu VM.
- [x] Verify Loki StatefulSet/Deployment and Promtail DaemonSet are `Running` in `monitoring` namespace.
- [x] Open Grafana at `http://localhost:3001` $\rightarrow$ Explore $\rightarrow$ select `Loki`.
- [x] Run query `{app="backend"}` and verify backend logs stream live.
- [x] Run query `{app="backend"} | json | level="error"` and verify JSON pipeline filtering.

---

### Phase 6: Runtime Security (Falco & Trivy) — MANIFESTS & SCRIPTS READY 🛡️

#### 6.1 Deploy Falco & Falcosidekick via Helm
- [x] Custom Helm values [`k8s/security/falco-values.yaml`](file:///c:/Users/mahes/OneDrive/Documents/Desktop/SentinelOpsAi/k8s/security/falco-values.yaml) with `driver.kind=modern_ebpf` and Falcosidekick WebUI.
- [x] Webhook alert forwarding configured to `http://collector-service.sentinelopsai.svc.cluster.local:8000/events/falco`.
- [x] Added `@app.post("/events/falco")` ingestion webhook endpoint to [`collector-service/main.py`](file:///c:/Users/mahes/OneDrive/Documents/Desktop/SentinelOpsAi/collector-service/main.py).
- [x] Rollout automation script [`scripts/deploy-security.sh`](file:///c:/Users/mahes/OneDrive/Documents/Desktop/SentinelOpsAi/scripts/deploy-security.sh) deploying into `falco` namespace.

#### 6.2 Threat Simulation & Verification
- [x] Create security event simulation script [`scripts/test-security.sh`](file:///c:/Users/mahes/OneDrive/Documents/Desktop/SentinelOpsAi/scripts/test-security.sh):
  - Triggers unauthorized `cat /etc/shadow` in backend pod.
  - Verifies Falco eBPF detection log.
  - Verifies Falcosidekick HTTP webhook delivery.
  - Verifies Collector Service alert reception.

#### 6.3 Vulnerability Assessment (Trivy)
- [x] Create automated image scanner script [`scripts/scan-images.sh`](file:///c:/Users/mahes/OneDrive/Documents/Desktop/SentinelOpsAi/scripts/scan-images.sh) scanning backend, frontend, and collector container images with JSON reports saved to `reports/`.

#### 6.4 Rollout & Teardown Automation
- [x] Create Linux security deployment script [`scripts/deploy-security.sh`](file:///c:/Users/mahes/OneDrive/Documents/Desktop/SentinelOpsAi/scripts/deploy-security.sh).
- [x] Create Linux security teardown script [`scripts/undeploy-security.sh`](file:///c:/Users/mahes/OneDrive/Documents/Desktop/SentinelOpsAi/scripts/undeploy-security.sh).
- [x] Create Windows PowerShell deployment and teardown scripts (`scripts/deploy-security.ps1`, `scripts/undeploy-security.ps1`).

#### Phase 6 Verification Checklist:
- [x] Run `./scripts/deploy-security.sh` on Ubuntu VM.
- [x] Verify Falco DaemonSet and Falcosidekick are `Running` in `falco` namespace (`kubectl get pods -n falco`).
- [x] Access Falcosidekick WebUI at `http://localhost:2802` via port-forward.
- [x] Run `./scripts/test-security.sh` and verify alert propagation through Falco $\rightarrow$ Falcosidekick $\rightarrow$ Collector.
- [x] Run `./scripts/scan-images.sh` and check generated reports in `reports/`.

---

### Phase 7: Telemetry Collector Implementation — CODE & RBAC READY 📡

#### 7.1 Multi-Source Ingestion Engines & Event Persistence
- [x] Implemented MongoDB event store with in-memory fallback in [`collector-service/db.py`](file:///c:/Users/mahes/OneDrive/Documents/Desktop/SentinelOpsAi/collector-service/db.py).
- [x] **Prometheus Poller** ([`collector-service/pollers/prometheus_poller.py`](file:///c:/Users/mahes/OneDrive/Documents/Desktop/SentinelOpsAi/collector-service/pollers/prometheus_poller.py)):
  - Polls CPU and Memory metrics every 30s.
  - Generates warning/critical events when memory exceeds 90% of the 200Mi limit (`180Mi`).
- [x] **Loki Poller** ([`collector-service/pollers/loki_poller.py`](file:///c:/Users/mahes/OneDrive/Documents/Desktop/SentinelOpsAi/collector-service/pollers/loki_poller.py)):
  - Polls LogQL for error logs in `sentinelopsai` over the past 60s.
  - Normalizes and stores application error logs.
- [x] **Kubernetes Poller** ([`collector-service/pollers/k8s_poller.py`](file:///c:/Users/mahes/OneDrive/Documents/Desktop/SentinelOpsAi/collector-service/pollers/k8s_poller.py)):
  - Detects pod restart count spikes and `CrashLoopBackOff` or `OOMKilled` states via the in-cluster K8s API.
- [x] **Falco Webhook** ([`collector-service/main.py`](file:///c:/Users/mahes/OneDrive/Documents/Desktop/SentinelOpsAi/collector-service/main.py)):
  - Ingests real-time security alerts forwarded by Falcosidekick at `/events/falco`.

#### 7.2 In-Cluster RBAC & Deployment Manifests
- [x] Created [`k8s/collector/collector-rbac.yaml`](file:///c:/Users/mahes/OneDrive/Documents/Desktop/SentinelOpsAi/k8s/collector/collector-rbac.yaml) with `collector-sa` and read-only `Role` for pods and events.
- [x] Updated [`k8s/collector/collector-deployment.yaml`](file:///c:/Users/mahes/OneDrive/Documents/Desktop/SentinelOpsAi/k8s/collector/collector-deployment.yaml) with `serviceAccountName: collector-sa` and database / poller environment variables.

#### 7.3 Verification Automation
- [x] Created collector verification script [`scripts/test-collector.sh`](file:///c:/Users/mahes/OneDrive/Documents/Desktop/SentinelOpsAi/scripts/test-collector.sh).

#### Phase 7 Verification Checklist:
- [x] Implemented Telemetry Collector with Prometheus, Loki, K8s, and Falco pollers.
- [x] In-cluster scoped RBAC (`collector-sa`, `collector-reader`).
- [x] Live event verification script [`scripts/test-collector.sh`](file:///c:/Users/mahes/OneDrive/Documents/Desktop/SentinelOpsAi/scripts/test-collector.sh).

---

### Phase 8: Cross-Domain Correlation Engine — COMPLETED ✅

- [x] Implemented multi-source event correlation in `correlation-engine/correlator.py`.
- [x] Rule evaluation: Memory Failure, CrashLoopBackOff, Security Threat.
- [x] Cooldown deduplication preventing event storms in MongoDB (`sentinelops.incidents`).
- [x] Verification automation script [`scripts/test-correlation.sh`](file:///c:/Users/mahes/OneDrive/Documents/Desktop/SentinelOpsAi/scripts/test-correlation.sh).

---

### Phase 9: AI Root Cause Analysis & Vector RAG — COMPLETED ✅

- [x] Deployed Qdrant Vector Database in Kubernetes (`k8s/qdrant/`).
- [x] Ingested markdown SRE runbooks (`knowledge_base/`) into Qdrant collection `runbooks`.
- [x] Built semantic retriever (`rag/retriever.py`) and LLM reasoning engine (`llm/client.py`).
- [x] Verification script [`scripts/test-rag.sh`](file:///c:/Users/mahes/OneDrive/Documents/Desktop/SentinelOpsAi/scripts/test-rag.sh).

---

### Phase 10: Policy Guardrails & Action Enrichment — COMPLETED ✅

- [x] Implemented safety policy map (`policy/policy_map.py`):
  - `restart_pod`: Low Risk, Auto-Approved (`approval_required: false`).
  - `scale_deployment`: Low Risk, Auto-Approved.
  - `increase_memory_limit`: Medium Risk, Human Approval Required (`approval_required: true`).
  - `block_ip`: Medium Risk, Human Approval Required.
- [x] Recommendation enrichment pipeline generating validated `kubectl` commands.

---

### Phase 11: Autonomous Remediation AI Agent — COMPLETED ✅

- [x] Write-scoped in-cluster Kubernetes RBAC (`k8s/ai-agent/ai-agent-rbac.yaml`).
- [x] Autonomous self-healing execution loop (`ai-agent/agent.py`).
- [x] Circuit breaker (`ai-agent/circuit_breaker.py`) preventing infinite restart loops.
- [x] Closed-loop verification (`ai-agent/verifier.py`) confirming workload recovery.
- [x] Human-in-the-Loop approval endpoints (`POST /incidents/{id}/approve/{action_index}`).
- [x] Immutable audit trail in MongoDB (`sentinelops.remediation_audit`).
- [x] Verification script [`scripts/test-agent.sh`](file:///c:/Users/mahes/OneDrive/Documents/Desktop/SentinelOpsAi/scripts/test-agent.sh).

---

### Phase 12: Unified SRE Dashboard & Incident Response Console — COMPLETED ✅

- [x] Multi-tab navigation in `frontend/src/components/Navbar.jsx`:
  - 🛡️ **AI Incident Response**: Real-time correlated incidents stream with live notification badge.
  - 📋 **Workload Tasks**: ToDo application with SRE failure simulation dock.
  - 📜 **Remediation Audit**: Real-time table of autonomous agent actions and closed-loop verification results.
  - 🌐 **Cluster Observability**: Microservice topology grid and direct links to Grafana, Prometheus, Falcosidekick.
- [x] Interactive Incident Response Center (`frontend/src/components/IncidentConsole.jsx`):
  - Incident severity badges (Critical, Warning, Info), AI confidence gauges.
  - Synthesized AI Root Cause diagnosis display.
  - Multi-source correlated evidence viewer (Prometheus, Loki, Falco).
  - 1-Click Human-in-the-Loop **"Approve & Execute"** and **"Reject"** buttons.
- [x] Audit Trail viewer (`frontend/src/components/AuditTrail.jsx`).
- [x] Cluster Overview & Natural Language RAG Explorer (`frontend/src/components/ClusterOverview.jsx`).
- [x] Master End-to-End Autonomous Pipeline Script [`scripts/test-e2e.sh`](file:///c:/Users/mahes/OneDrive/Documents/Desktop/SentinelOpsAi/scripts/test-e2e.sh).

---

## 🔬 End-to-End Milestone Verification Runbook

To demonstrate the full autonomous self-healing platform in action, run:
```bash
./scripts/test-e2e.sh backend
```
This automatically executes:
`Collector (ingest) ➔ Correlation (fuse) ➔ AI Service (RAG diagnosis) ➔ AI Agent (heal & verify)`.
