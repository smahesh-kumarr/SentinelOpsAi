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

### Phase 3: Kubernetes Deployment

#### 3.1 Cluster & Namespace Setup
- [ ] Initialize single-node cluster using `kind` (`kind create cluster --name sentinelops`) or `k3s`.
- [ ] Create dedicated namespace manifest `k8s/00-namespace.yaml`:
  ```yaml
  apiVersion: v1
  kind: Namespace
  metadata:
    name: sentinelopsai
  ```

#### 3.2 Database Deployment (MongoDB)
- [ ] Create MongoDB Deployment manifest (`k8s/mongodb/mongodb-deployment.yaml`) with persistent/ephemeral storage.
- [ ] Create MongoDB Service manifest (`k8s/mongodb/mongodb-service.yaml`) exposing port `27017` on name `mongodb`.

#### 3.3 Configuration & Secrets
- [ ] Create non-sensitive ConfigMap `k8s/backend/backend-configmap.yaml`:
  - `PORT: "3000"`
  - `NODE_ENV: "production"`
  - `LOG_LEVEL: "info"`
  - `ENABLE_TEST_ROUTES: "true"`
  - `MONGODB_DB_NAME: "sentinelops"`
- [ ] Define CLI command template for sensitive Secret creation (never hardcode real passwords in YAML):
  ```bash
  kubectl create secret generic backend-secrets -n sentinelopsai \
    --from-literal=MONGODB_URI="mongodb://mongodb.sentinelopsai.svc.cluster.local:27017/sentinelops" \
    --from-literal=JWT_SECRET="<secret-key>"
  ```

#### 3.4 Backend Deployment & Service
- [ ] Create Backend Deployment `k8s/backend/backend-deployment.yaml`:
  - `replicas: 2`.
  - Image: `<dockerhub-user>/sentinelops-backend:v1`.
  - Resources:
    - Requests: `memory: "128Mi"`, `cpu: "100m"`.
    - Limits: `memory: "200Mi"`, `cpu: "300m"` (**CRITICAL: Intentionally constrained for OOM demos**).
  - Probes:
    - Readiness probe: `httpGet: { path: /health, port: 3000 }`, `initialDelaySeconds: 5`.
    - Liveness probe: `httpGet: { path: /health, port: 3000 }`, `initialDelaySeconds: 10`.
  - Environment injection: `envFrom` referencing `backend-config` and `backend-secrets`.
- [ ] Create Backend Service `k8s/backend/backend-service.yaml`:
  - Type: `ClusterIP`.
  - Port definition: **Must include explicit name** `name: "3000"` or `name: "http"`, `port: 3000`, `targetPort: 3000`.

#### 3.5 Frontend Deployment & Service
- [ ] Create Frontend Deployment `k8s/frontend/frontend-deployment.yaml`:
  - `replicas: 1`.
  - Image: `<dockerhub-user>/sentinelops-frontend:v1`.
  - Readiness/Liveness probe on port `80` (`path: /`).
- [ ] Create Frontend Service `k8s/frontend/frontend-service.yaml`:
  - Type: `NodePort` or `ClusterIP` with port-forwarding access on port `80`.

#### Phase 3 Verification Checklist:
- [ ] `kubectl apply -f k8s/00-namespace.yaml`.
- [ ] `kubectl apply -f k8s/backend/` and `k8s/frontend/`.
- [ ] `kubectl get pods -n sentinelopsai -w` reaches `Running` state and passes probes (2/2 ready).
- [ ] Port-forward backend: `kubectl port-forward svc/backend -n sentinelopsai 3000:3000` -> `curl localhost:3000/health` returns `200 OK`.
- [ ] Port-forward frontend: `kubectl port-forward svc/frontend -n sentinelopsai 8080:80` -> browser renders dashboard.

---

### Phase 4: Monitoring (Prometheus & Grafana)

#### 4.1 Deploy `kube-prometheus-stack`
- [ ] Add Prometheus Community Helm repository:
  ```bash
  helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
  helm repo update
  ```
- [ ] Install stack into dedicated `monitoring` namespace:
  ```bash
  helm install monitoring prometheus-community/kube-prometheus-stack \
    --namespace monitoring \
    --create-namespace
  ```
- [ ] Verify that Prometheus Operator, Alertmanager, Node Exporter, and Grafana pods are running.

#### 4.2 Configure Prometheus Scrape via ServiceMonitor CRD
- [ ] Create ServiceMonitor manifest `k8s/monitoring/backend-servicemonitor.yaml`:
  ```yaml
  apiVersion: monitoring.coreos.com/v1
  kind: ServiceMonitor
  metadata:
    name: backend-monitor
    namespace: sentinelopsai
    labels:
      release: monitoring   # REQUIRED: Matches Helm release name
  spec:
    selector:
      matchLabels:
        app: backend
    namespaceSelector:
      matchNames:
        - sentinelopsai
    endpoints:
      - port: "3000"        # MUST match the named port on backend Service
        path: /metrics
        interval: 15s
  ```
- [ ] Apply manifest: `kubectl apply -f k8s/monitoring/backend-servicemonitor.yaml`.

#### 4.3 Validate Target Discovery & Metrics
- [ ] Port-forward Prometheus Web UI:
  ```bash
  kubectl port-forward svc/monitoring-kube-prometheus-prometheus -n monitoring 9090:9090
  ```
- [ ] Open `http://localhost:9090/targets` and verify:
  - `serviceMonitor/sentinelopsai/backend-monitor/0` is listed with state **UP** (1/1 or 2/2 endpoints).
- [ ] Query Prometheus expressions in Graph tab:
  - `http_requests_total{namespace="sentinelopsai"}`
  - `rate(http_requests_total{namespace="sentinelopsai"}[1m])`
  - `container_memory_working_set_bytes{namespace="sentinelopsai", container="backend"}`

#### 4.4 Configure Grafana Dashboards
- [ ] Retrieve Grafana admin password:
  ```bash
  kubectl get secret monitoring-grafana -n monitoring -o jsonpath="{.data.admin-password}" | base64 -d
  ```
- [ ] Port-forward Grafana UI:
  ```bash
  kubectl port-forward svc/monitoring-grafana -n monitoring 3001:80
  ```
- [ ] Log in at `http://localhost:3001` (user: `admin`, password from secret).
- [ ] Import standard infrastructure dashboards:
  - Dashboard ID **1860** (Node Exporter Full).
  - Dashboard ID **315** (Kubernetes Cluster Monitoring).
- [ ] Build custom **SentinelOps Application Dashboard** containing:
  1. **Request Throughput Panel**: `sum(rate(http_requests_total{namespace="sentinelopsai"}[1m])) by (status_code, route)`
  2. **P95 Latency Panel**: `histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket{namespace="sentinelopsai"}[5m])) by (le))`
  3. **Backend Pod Memory vs Limit Panel**:
     - Metric: `sum(container_memory_working_set_bytes{namespace="sentinelopsai", container="backend"}) by (pod)`
     - Threshold line: `209715200` (200Mi limit) with warning at 90% (`188743680`).

#### Phase 4 Verification Checklist:
- [ ] `ServiceMonitor` recognized by Prometheus Operator.
- [ ] Prometheus UI shows targets in healthy **UP** status.
- [ ] Simulating load on backend increments `http_requests_total` in Prometheus graphs.
- [ ] Calling `/simulate/leak` causes memory curve in Grafana to climb toward the 200Mi threshold.
- [ ] Grafana custom dashboard saved and viewable.

---

## 🔬 End-to-End Milestone Verification Runbook

To demonstrate the full success of Goals 1 through 4, execute the following test runbook:

1. **Baseline State Verification**:
   - Verify all pods in `sentinelopsai` and `monitoring` namespaces are healthy:
     ```bash
     kubectl get pods -n sentinelopsai
     kubectl get pods -n monitoring
     ```
   - Confirm backend targets in Prometheus are **UP**.
2. **Normal Traffic Verification**:
   - Send regular requests to the frontend/backend:
     ```bash
     for i in {1..20}; do curl -s http://<backend-ip>:3000/health; sleep 0.5; done
     ```
   - Observe `http_requests_total` increasing on the Grafana dashboard.
3. **Simulated Memory Anomaly (Demo Proof)**:
   - Call the memory leak simulation endpoint:
     ```bash
     for i in {1..10}; do curl -s http://<backend-ip>:3000/simulate/leak; sleep 1; done
     ```
   - Watch the Grafana memory chart approach the 90% limit (~188Mi).
   - In Prometheus, execute:
     ```promql
     sum(container_memory_working_set_bytes{namespace="sentinelopsai", container="backend"}) by (pod)
     ```
   - Continue leaking until container triggers `OOMKilled`:
     ```bash
     kubectl get pods -n sentinelopsai -w
     ```
   - Verify that Kubernetes restarts the pod, and restart count increases.
4. **Structured Logging Verification**:
   - Inspect container logs:
     ```bash
     kubectl logs -l app=backend -n sentinelopsai --tail=20
     ```
   - Verify every line is valid JSON with `level`, `msg`, `service: "backend"`, and `timestamp`.

---

## 🔗 Bridge to Upcoming Phases

Completing these four goals creates the operational foundation for the remaining SentinelOpsAI platform components:

- **Phase 5 (Logging with Loki & Promtail)**: Promtail will ingest the structured JSON logs emitted by the backend; Promtail's JSON pipeline stage will parse `level` and `service` into indexable labels.
- **Phase 6 (Security with Falco)**: Falco with `modern_ebpf` driver will detect suspicious runtime events (e.g. terminal execution or shadow file reads in backend pods) and forward them to the Collector.
- **Phase 7 (Collector Service Implementation)**: The Collector will actively query Prometheus (using the same queries validated in Goal 4) and Loki, subscribe to Falco alerts, and persist raw signals into the Postgres `events` table.
- **Phase 8 (Correlation Engine)**: Multi-source signals (Prometheus high memory + K8s restart count + Loki OOM log) will be correlated into a unified incident.
