# SentinelOpsAI — Complete Detailed Guide

All phases, in build order, with code. Each phase includes: what it does, where it runs, implementation, and a verification checklist. Phase 11 (Agent) and Phase 12 (Dashboard) are included as design specs — not yet implemented.

---

## Phase 1 — Development Planning

Every phase should be scoped using this template before writing code:
```
Phase: [name]
Goal (one sentence):
Inputs it depends on (previous phase's output):
Output (what the next phase will consume):
Proof it works (a command or URL you can run/hit):
Done when: [specific observable condition]
```

**Worked example — prom-client integration (Node.js/Express):**
```bash
npm install prom-client
```
```js
// metrics.js
const client = require('prom-client');
const register = new client.Registry();
client.collectDefaultMetrics({ register });

const httpRequestCounter = new client.Counter({
  name: 'http_requests_total', help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status_code'], registers: [register],
});
const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds', help: 'HTTP request duration',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.05, 0.1, 0.3, 0.5, 1, 2, 5], registers: [register],
});
module.exports = { register, httpRequestCounter, httpRequestDuration };
```
Add middleware to record every request, expose `/metrics`:
```js
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});
```
Proof: `curl localhost:3000/metrics` shows real counters. FastAPI equivalent: `pip install prometheus-fastapi-instrumentator` → `Instrumentator().instrument(app).expose(app)`.

**Backend also needs:** `/health` endpoint, centralized structured JSON logger (see Phase 6), and gated `/simulate/leak` `/simulate/slow` `/simulate/crash` routes for generating demo failure scenarios later.

**Collector Service in this phase — scaffold only:**
```python
# schemas.py
from pydantic import BaseModel
from typing import Optional

class EventIn(BaseModel):
    source: str
    service: str
    severity: Optional[str] = None
    data: dict
```
```python
# main.py (stub)
from fastapi import FastAPI
from schemas import EventIn
import logging, json

app = FastAPI()
logger = logging.getLogger("collector")

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/events")
def receive_event(event: EventIn):
    logger.info(json.dumps({"received_event": event.dict()}))
    return {"status": "accepted", "event": event}
```
No live DB, no real Prometheus/Loki/Falco integration yet — that comes in Phase 8.

**Phase 1 checklist:** `/metrics` and `/health` work on backend; frontend calls backend successfully; Collector's `/events` returns 422 on invalid payload (confirms schema isn't too loose); code pushed to GitHub with `.env` gitignored.

---

## Phase 2 — Containerization

`.dockerignore` (every service): `node_modules`, `__pycache__`, `.env`, `.git`, `dist`, `venv/`

**Backend Dockerfile:**
```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app .
EXPOSE 3000
ENV NODE_ENV=production
CMD ["node", "server.js"]
```

**Frontend Dockerfile** (needs a build step, API URL baked in at build time since it's static):
```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
```

**Python service Dockerfile** (Collector, Correlation Engine, AI Service all use this pattern):
```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```
`--host 0.0.0.0` is required — default `127.0.0.1` is unreachable from outside the container.

**Build + push workflow:**
```bash
# Windows: git add . && git commit -m "..." && git push origin main
# Linux machine:
git pull origin main
docker login
docker build -t <you>/sentinelops-backend:v1 ./backend
docker push <you>/sentinelops-backend:v1
```
`build.sh` loop:
```bash
#!/bin/bash
VERSION=$1
for svc in frontend backend collector-service correlation-engine ai-service ai-agent; do
  docker build -t <you>/sentinelops-$svc:$VERSION ./$svc
  docker push <you>/sentinelops-$svc:$VERSION
done
```

**Verify before pushing:** run each image standalone (`docker run -p ... `), curl its `/health`, check image size sanity (`docker images`), then pull-back test (`docker rmi` then `docker pull`) to confirm DockerHub push is real and pullable.

---

## Phase 3 — Kubernetes Deployment

**ConfigMap vs Secret:** non-sensitive (`NODE_ENV`, `PORT`, `LOG_LEVEL`) → ConfigMap. Sensitive (`DATABASE_URL`, `JWT_SECRET`, API keys) → Secret, created via CLI so real values never sit in a committed file:
```bash
kubectl create secret generic backend-secrets -n sentinelopsai \
  --from-literal=DATABASE_URL="postgresql://sentinel:<pw>@postgres:5432/sentinelops" \
  --from-literal=JWT_SECRET="<random-string>"
```

**Backend Deployment + Service:**
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: backend
  namespace: sentinelopsai
spec:
  replicas: 2
  selector:
    matchLabels: { app: backend }
  template:
    metadata:
      labels: { app: backend }
    spec:
      containers:
        - name: backend
          image: <you>/sentinelops-backend:v1
          ports: [{ containerPort: 3000 }]
          envFrom:
            - configMapRef: { name: backend-config }
            - secretRef: { name: backend-secrets }
          resources:
            requests: { memory: "128Mi", cpu: "100m" }
            limits: { memory: "200Mi", cpu: "300m" }   # deliberately low - needed for OOMKilled demos
          readinessProbe:
            httpGet: { path: /health, port: 3000 }
            initialDelaySeconds: 5
          livenessProbe:
            httpGet: { path: /health, port: 3000 }
            initialDelaySeconds: 10
---
apiVersion: v1
kind: Service
metadata:
  name: backend
  namespace: sentinelopsai
spec:
  selector: { app: backend }
  ports:
    - name: "3000"   # NAMED port - required later for ServiceMonitor
      port: 3000
      targetPort: 3000
```
Frontend Deployment follows the same shape, minus `envFrom` (build-time baked config).

```bash
kubectl create namespace sentinelopsai
kubectl apply -f k8s/backend-configmap.yaml
kubectl apply -f k8s/backend-deployment.yaml
kubectl apply -f k8s/frontend-deployment.yaml
kubectl get pods -n sentinelopsai -w
```

**Cluster itself:** single-node `kind` or `k3s` on your Linux machine — `kind create cluster --name sentinelops`.

---

## Phase 4 — Monitoring (Prometheus + Grafana)

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update
helm install monitoring prometheus-community/kube-prometheus-stack -n monitoring --create-namespace
```

**Important correction to a common assumption:** this chart does **not** use `prometheus.io/scrape` pod annotations by default — it uses Prometheus Operator's `ServiceMonitor` CRD. Annotations alone will silently do nothing here.

```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: backend-monitor
  namespace: sentinelopsai
  labels:
    release: monitoring   # MUST match the Helm release name or Prometheus Operator ignores it
spec:
  selector:
    matchLabels: { app: backend }
  namespaceSelector:
    matchNames: [sentinelopsai]
  endpoints:
    - port: "3000"   # must match the Service's named port
      path: /metrics
      interval: 15s
```

Verify: port-forward Prometheus (`kubectl port-forward svc/monitoring-kube-prometheus-prometheus -n monitoring 9090:9090`), check `/targets` shows `backend-monitor` as **UP**, query `http_requests_total` for real data.

**Grafana:**
```bash
kubectl port-forward svc/monitoring-grafana -n monitoring 3000:80
kubectl get secret monitoring-grafana -n monitoring -o jsonpath="{.data.admin-password}" | base64 -d
```
Import dashboard IDs **1860** (Node Exporter Full) and **315** (Kubernetes cluster) — don't hand-build standard infra panels. Build one custom panel for `http_requests_total` as your own dashboard.

---

## Phase 5 — Logging (Loki + Promtail)

```bash
helm repo add grafana https://grafana.github.io/helm-charts
helm repo update
helm install loki grafana/loki-stack -n monitoring --set grafana.enabled=false --set promtail.enabled=true
```
`grafana.enabled=false` avoids installing a second, separate Grafana instance — you already have one from Phase 4.

**Add Loki as a data source** (Data sources → Add → Loki → URL `http://loki.monitoring.svc.cluster.local:3100` → Save & Test), or provision it as code via a labeled ConfigMap that kube-prometheus-stack's Grafana sidecar auto-loads:
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: grafana-loki-datasource
  namespace: monitoring
  labels: { grafana_datasource: "1" }
data:
  loki-datasource.yaml: |
    apiVersion: 1
    datasources:
      - name: Loki
        type: loki
        access: proxy
        url: http://loki.monitoring.svc.cluster.local:3100
```

**Explore query:** `{app="backend"}` — the `app` label comes automatically from your Deployment's `labels: app: backend`.

**Structured logging, centralized:**
```js
// logger.js
function log(level, msg, extra = {}) {
  console.log(JSON.stringify({ level, msg, service: "backend", timestamp: new Date().toISOString(), ...extra }));
}
module.exports = {
  info: (msg, extra) => log("info", msg, extra),
  warn: (msg, extra) => log("warn", msg, extra),
  error: (msg, extra) => log("error", msg, extra),
};
```
For Loki to treat `level`/`service` as **queryable labels** (not just opaque text), Promtail needs a JSON pipeline stage configured in its Helm values — without this, `{app="backend"} | json | level="error"` won't filter correctly.

---

## Phase 6 — Security (Falco)

```bash
helm repo add falcosecurity https://falcosecurity.github.io/charts
helm repo update
helm install falco falcosecurity/falco -n falco --create-namespace \
  --set driver.kind=modern_ebpf \
  --set falcosidekick.enabled=true \
  --set falcosidekick.webui.enabled=true
```
`driver.kind=modern_ebpf` is required — Falco's default kernel-module driver frequently fails inside `kind`/containerized nodes without matching kernel headers.

**Forward alerts to the Collector:**
```bash
helm upgrade falco falcosecurity/falco -n falco --reuse-values \
  --set falcosidekick.config.webhook.address=http://collector.sentinelopsai.svc.cluster.local:8000/events/falco
```

**Test:**
```bash
kubectl exec -it deploy/backend -n sentinelopsai -- sh -c "cat /etc/shadow"
kubectl logs -n falco -l app.kubernetes.io/name=falco | grep -i sensitive
```
Trace the alert through: Falco log → falcosidekick forward (200/202) → Collector's `/events/falco` log line.

**Trivy** (simpler, no in-cluster daemon needed for a demo):
```bash
trivy image <you>/sentinelops-backend:v1 --format json --output trivy-report.json
```

---

## Phase 7 — Collector Service (real implementation)

Runs **in-cluster** as a Deployment, single replica (avoid double-polling), read-only RBAC ServiceAccount (`get/list/watch` on pods/deployments/events — nothing more).

```python
# db.py
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from models import Base

engine = create_engine(os.environ["DATABASE_URL"])
SessionLocal = sessionmaker(bind=engine)

def init_db():
    Base.metadata.create_all(bind=engine)

def save_event(event_dict: dict):
    from models import Event
    session = SessionLocal()
    try:
        session.add(Event(**event_dict))
        session.commit()
    finally:
        session.close()
```

```python
# pollers/prometheus_poller.py
import httpx, os

PROM_URL = os.environ["PROMETHEUS_URL"]
NAMESPACE = os.environ["K8S_NAMESPACE"]

async def poll_prometheus(save_event_fn):
    async with httpx.AsyncClient() as client:
        cpu_query = f'sum(rate(container_cpu_usage_seconds_total{{namespace="{NAMESPACE}", container!=""}}[2m])) by (pod) * 100'
        mem_query = f'sum(container_memory_working_set_bytes{{namespace="{NAMESPACE}", container!=""}}) by (pod)'
        cpu_resp = await client.get(f"{PROM_URL}/api/v1/query", params={"query": cpu_query})
        mem_resp = await client.get(f"{PROM_URL}/api/v1/query", params={"query": mem_query})

        for r in cpu_resp.json()["data"]["result"]:
            if float(r["value"][1]) > 90:
                save_event_fn({"source": "prometheus", "service": r["metric"].get("pod", "unknown"),
                               "severity": "warning", "data": {"metric": "cpu", "value": float(r["value"][1])}})
        for r in mem_resp.json()["data"]["result"]:
            value_bytes = float(r["value"][1])
            if value_bytes > 0.9 * 209715200:   # 90% of 200Mi limit
                save_event_fn({"source": "prometheus", "service": r["metric"].get("pod", "unknown"),
                               "severity": "warning", "data": {"metric": "memory", "value_bytes": value_bytes}})
```

```python
# pollers/loki_poller.py
import httpx, os, time

LOKI_URL = os.environ["LOKI_URL"]

async def poll_loki(save_event_fn):
    async with httpx.AsyncClient() as client:
        now_ns = int(time.time() * 1e9)
        start_ns = now_ns - 60_000_000_000
        resp = await client.get(f"{LOKI_URL}/loki/api/v1/query_range", params={
            "query": '{namespace="sentinelopsai"} | json | level="error"',
            "start": start_ns, "end": now_ns, "limit": 100
        })
        for stream in resp.json().get("data", {}).get("result", []):
            service = stream["stream"].get("app", "unknown")
            for entry in stream["values"]:
                save_event_fn({"source": "loki", "service": service, "severity": "error", "data": {"log": entry[1]}})
```

```python
# pollers/k8s_poller.py
from kubernetes import client, config

def poll_k8s(save_event_fn, namespace="sentinelopsai"):
    config.load_incluster_config()
    v1 = client.CoreV1Api()
    for pod in v1.list_namespaced_pod(namespace).items:
        for cs in pod.status.container_statuses or []:
            if cs.restart_count > 3:
                save_event_fn({"source": "k8s", "service": pod.metadata.labels.get("app", pod.metadata.name),
                               "severity": "warning", "data": {"restart_count": cs.restart_count, "pod": pod.metadata.name}})
```

```python
# main.py
from fastapi import FastAPI
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from db import init_db, save_event
from pollers.prometheus_poller import poll_prometheus
from pollers.loki_poller import poll_loki
from pollers.k8s_poller import poll_k8s
import os

app = FastAPI()
scheduler = AsyncIOScheduler()
INTERVAL = int(os.environ.get("POLL_INTERVAL_SECONDS", 30))

@app.on_event("startup")
async def startup():
    init_db()
    scheduler.add_job(poll_prometheus, "interval", seconds=INTERVAL, args=[save_event])
    scheduler.add_job(poll_loki, "interval", seconds=INTERVAL, args=[save_event])
    scheduler.add_job(poll_k8s, "interval", seconds=INTERVAL, args=[save_event])
    scheduler.start()

@app.get("/health")
def health(): return {"status": "ok"}

@app.post("/events/falco")
def receive_falco_event(payload: dict):
    save_event({"source": "falco", "service": payload.get("output_fields", {}).get("k8s.pod.name", "unknown"),
                "severity": payload.get("priority", "unknown"), "data": payload})
    return {"status": "accepted"}

@app.get("/events")
def list_events(processed: bool | None = None):
    from db import SessionLocal
    from models import Event
    session = SessionLocal()
    q = session.query(Event)
    if processed is not None:
        q = q.filter(Event.processed == processed)
    return q.order_by(Event.timestamp.desc()).limit(100).all()
```

**Verify:** trigger `/simulate/leak|slow|crash`, check `kubectl logs -f deploy/collector`, confirm real rows land in Postgres `events` table across all 4 sources.

---

## Phase 8 — Correlation Engine

In-cluster, single replica, reads/writes the **same Postgres** directly (no HTTP hop).

```python
# models.py additions
class Incident(Base):
    __tablename__ = "incidents"
    id = Column(Integer, primary_key=True)
    title = Column(String)
    service = Column(String, index=True)
    severity = Column(String)
    incident_type = Column(String, index=True)
    evidence = Column(JSON)
    status = Column(String, default="open")
    root_cause = Column(String, nullable=True)
    confidence = Column(Float, nullable=True)
    recommendations = Column(JSON, nullable=True)   # added in Phase 10
    created_at = Column(DateTime, default=datetime.utcnow)
```

```python
# rules.py - most specific rule first
def rule_memory_failure(events):
    mem = [e for e in events if e.source == "prometheus" and e.data.get("metric") == "memory"]
    restarts = [e for e in events if e.source == "k8s" and e.data.get("restart_count", 0) > 3]
    oom_logs = [e for e in events if e.source == "loki" and "OutOfMemoryError" in str(e.data.get("log", ""))]
    if mem and (restarts or oom_logs):
        return {"title": "Backend memory failure", "incident_type": "memory_failure",
                "severity": "critical", "evidence": summarize([mem, restarts, oom_logs])}
    return None

def rule_crashloop(events):
    restarts = [e for e in events if e.source == "k8s" and e.data.get("restart_count", 0) > 3]
    if restarts and not any(e.data.get("metric") == "memory" for e in events if e.source == "prometheus"):
        return {"title": "CrashLoopBackOff detected", "incident_type": "crashloop",
                "severity": "critical", "evidence": summarize([restarts])}
    return None

def rule_brute_force(events):
    ssh = [e for e in events if e.source == "falco" and "ssh" in str(e.data).lower()]
    if len(ssh) >= 5:
        return {"title": "Possible SSH brute-force activity", "incident_type": "brute_force",
                "severity": "critical", "evidence": summarize([ssh])}
    return None

def summarize(groups):
    return [{"source": e.source, "severity": e.severity, "timestamp": e.timestamp.isoformat(), "data": e.data}
            for g in groups for e in g]

ALL_RULES = [rule_memory_failure, rule_crashloop, rule_brute_force]
```

```python
# correlator.py
from datetime import datetime, timedelta
from db import SessionLocal
from models import Event, Incident
from rules import ALL_RULES
import os

WINDOW = int(os.environ.get("EVENT_WINDOW_SECONDS", 300))
COOLDOWN = int(os.environ.get("INCIDENT_COOLDOWN_SECONDS", 600))

def run_correlation():
    session = SessionLocal()
    try:
        cutoff = datetime.utcnow() - timedelta(seconds=WINDOW)
        unprocessed = session.query(Event).filter(Event.processed == False, Event.timestamp >= cutoff).all()
        if not unprocessed:
            return
        for service in set(e.service for e in unprocessed):
            service_events = [e for e in unprocessed if e.service == service]
            for rule in ALL_RULES:
                result = rule(service_events)
                if result and not _dup(session, service, result["incident_type"]):
                    session.add(Incident(service=service, status="open", **result))
        for e in unprocessed:
            e.processed = True
        session.commit()
    finally:
        session.close()

def _dup(session, service, incident_type):
    cutoff = datetime.utcnow() - timedelta(seconds=COOLDOWN)
    return session.query(Incident).filter(
        Incident.service == service, Incident.incident_type == incident_type,
        Incident.status == "open", Incident.created_at >= cutoff
    ).first() is not None
```

**Proof of done:** triggering `/simulate/leak` produces exactly ONE `memory_failure` incident with multi-source evidence, not five unrelated rows. Re-triggering within the cooldown window does not duplicate it.

---

## Phase 9 — AI Service + RAG

In-cluster. Qdrant via Helm:
```bash
helm repo add qdrant https://qdrant.github.io/qdrant-helm
helm install qdrant qdrant/qdrant -n sentinelopsai --set persistence.size=2Gi
```

**Knowledge base** — short markdown runbooks in `knowledge-base/` (OOM handling, CrashLoopBackOff causes, brute-force response, etc).

**Ingestion (run as a one-off K8s Job, re-run when KB changes):**
```python
# ingest.py
from sentence_transformers import SentenceTransformer
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct
import os, glob

model = SentenceTransformer("BAAI/bge-m3")
client = QdrantClient(url=os.environ.get("QDRANT_URL", "http://qdrant:6333"))
client.recreate_collection("runbooks", vectors_config=VectorParams(size=1024, distance=Distance.COSINE))

points, pid = [], 0
for path in glob.glob("knowledge-base/*.md"):
    chunks = [c.strip() for c in open(path).read().split("\n\n") if c.strip()]
    for chunk, vec in zip(chunks, model.encode(chunks)):
        points.append(PointStruct(id=pid, vector=vec.tolist(), payload={"text": chunk, "source": os.path.basename(path)}))
        pid += 1
client.upsert(collection_name="runbooks", points=points)
```

**Retriever + LLM call:**
```python
# retriever.py
from sentence_transformers import SentenceTransformer
from qdrant_client import QdrantClient
import os

model = SentenceTransformer("BAAI/bge-m3")
client = QdrantClient(url=os.environ.get("QDRANT_URL", "http://qdrant:6333"))

def retrieve_context(query_text: str, top_k: int = 3) -> str:
    hits = client.search(collection_name="runbooks", query_vector=model.encode(query_text).tolist(), limit=top_k)
    return "\n\n".join(f"[{h.payload['source']}] {h.payload['text']}" for h in hits)
```
```python
# llm_client.py
import os, json
from anthropic import Anthropic

client = Anthropic(api_key=os.environ["LLM_API_KEY"])
MODEL = os.environ.get("LLM_MODEL", "claude-sonnet-4-6")

def analyze(incident_title, evidence, context) -> dict:
    prompt = f"""You are an SRE assistant analyzing a correlated incident.
Incident: {incident_title}
Evidence: {json.dumps(evidence, default=str)}
Relevant documentation:
{context}
Respond with ONLY valid JSON:
{{"root_cause": "...", "confidence": 0-100, "recommendations": [{{"action": "...", "risk": "low|medium|high"}}]}}"""
    resp = client.messages.create(model=MODEL, max_tokens=500, messages=[{"role": "user", "content": prompt}])
    text = resp.content[0].text.replace("```json", "").replace("```", "").strip()
    return json.loads(text)
```

**Analyzer loop (with Recommendation Engine folded in — Phase 10):**
```python
# policy_map.py
POLICY = {
    "restart_deployment": {"risk": "low", "approval_required": False, "command_template": "kubectl rollout restart deployment {service} -n sentinelopsai"},
    "scale_deployment": {"risk": "low", "approval_required": False, "command_template": "kubectl scale deployment {service} --replicas={replicas} -n sentinelopsai"},
    "rollback_deployment": {"risk": "medium", "approval_required": True, "command_template": "kubectl rollout undo deployment {service} -n sentinelopsai"},
    "increase_memory_limit": {"risk": "medium", "approval_required": True, "command_template": "kubectl set resources deployment {service} --limits=memory={memory} -n sentinelopsai"},
    "block_ip": {"risk": "medium", "approval_required": True, "command_template": "ufw deny from {ip}"},
    "investigate": {"risk": "info", "approval_required": True, "command_template": None},
}

def normalize_action(text: str) -> str:
    text = text.lower()
    if "restart" in text and "deployment" in text: return "restart_deployment"
    if "scale" in text or "replica" in text: return "scale_deployment"
    if "rollback" in text or "roll back" in text: return "rollback_deployment"
    if "memory limit" in text or "increase memory" in text: return "increase_memory_limit"
    if "block" in text and "ip" in text: return "block_ip"
    return "investigate"
```
```python
# enrich.py
from policy_map import POLICY, normalize_action

def enrich_recommendations(raw, service):
    out = []
    for rec in raw:
        key = normalize_action(rec["action"])
        p = POLICY[key]
        cmd = p["command_template"].format(service=service, replicas=rec.get("replicas", "<N>"),
                                            memory=rec.get("memory", "<value>"), ip=rec.get("ip", "<ip>")) if p["command_template"] else None
        out.append({"action": rec["action"], "action_key": key, "risk": p["risk"],
                    "approval_required": p["approval_required"], "suggested_command": cmd, "status": "pending"})
    return out
```
```python
# analyzer.py
from db import SessionLocal
from models import Incident
from retriever import retrieve_context
from llm_client import analyze
from enrich import enrich_recommendations

def run_analysis():
    session = SessionLocal()
    try:
        for incident in session.query(Incident).filter(Incident.root_cause.is_(None)).limit(5).all():
            context = retrieve_context(f"{incident.title} {incident.incident_type}")
            try:
                result = analyze(incident.title, incident.evidence, context)
                incident.root_cause = result["root_cause"]
                incident.confidence = float(result["confidence"])
                incident.recommendations = enrich_recommendations(result["recommendations"], incident.service)
                incident.status = "analyzed"
            except Exception as e:
                print(f"Analysis failed for incident {incident.id}: {e}")
        session.commit()
    finally:
        session.close()
```

**Proof of grounding:** temporarily remove the relevant knowledge-base doc, re-ingest, re-trigger — recommendation specificity should visibly drop. Put it back afterward. This is your evidence RAG is contributing real value, not decoration.

---

## Phase 11 — AI Agent (design, not yet built)

**RBAC — write-scoped, nothing else:**
```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: ai-agent-role
  namespace: sentinelopsai
rules:
  - apiGroups: ["apps"]
    resources: ["deployments"]
    verbs: ["get", "patch", "update"]
```

**Flow:**
1. Poll `incidents` where `status = "analyzed"`
2. For each recommendation with `approval_required: false` → execute via Python `kubernetes` client (in-cluster config), set that recommendation's `status` to `"executed"`
3. For `approval_required: true` → wait; expose `POST /approve/{incident_id}/{action_index}` for a future dashboard button
4. After executing, wait a short delay, re-check the original trigger condition (e.g. query Prometheus again) → mark `resolved` or `unresolved`
5. If `unresolved`, escalate — don't retry indefinitely

Only implement `restart_deployment` and `scale_deployment` for the 9-day sprint; treat `block_ip` as a stretch goal since it requires host-level access outside typical K8s RBAC.

---

## Phase 12 — Dashboard (design, not yet built)

React page reading the AI Service's `/incidents` endpoint (already returns fully enriched data: title, evidence, severity, root_cause, confidence, recommendations with risk/command/approval_required). Minimum: one "AI Incidents" table/list view with an Approve button wired to the Agent's `/approve` endpoint for medium/high-risk recommendations.

---

## Infrastructure Sizing

**One machine is enough for the whole demo.** Everything — app, Prometheus/Grafana, Loki/Promtail, Falco, Postgres, Qdrant, Collector, Correlation Engine, AI Service — runs as pods on a single-node `kind`/`k3s` cluster.

| Resource | Minimum | Recommended |
|---|---|---|
| vCPU | 6 | 8 |
| RAM | 12 GB | 16-32 GB |
| Disk | 50 GB SSD | 100 GB SSD |
| GPU | Not needed (API-based LLM) | — |

Cloud fallback if your machine can't hit this: AWS `t3a.2xlarge`/`m5.2xlarge`, GCP `e2-standard-8`, Azure `D8s_v5` — all ~8 vCPU/32GB, a few dollars total for a 9-day sprint if stopped when not in use. Use `k3s` over full `kubeadm` for lighter overhead on a single VM.

You'd only need more than one server if: self-hosting the LLM (needs GPU), or specifically demonstrating multi-node failure scenarios — neither applies to this project's scope.
