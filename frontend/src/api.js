// Centralized API Client
// Dynamically configured via VITE_API_URL, never hardcoded

// Smart dynamic API resolution:
// 1. Explicit VITE_API_URL if configured during build/env
// 2. Production container: uses window.location.origin (bypassing CORS via Nginx reverse proxy)
// 3. Local Vite dev: defaults to http://localhost:3000
function resolveApiBase() {
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl && envUrl.trim() !== "") {
    return envUrl.replace(/\/$/, "");
  }
  if (typeof window !== "undefined") {
    // If not running on standard Vite dev server port, use same-origin proxy
    if (window.location.port !== "5173") {
      return window.location.origin;
    }
  }
  return "http://localhost:3000";
}

const API_BASE = resolveApiBase();

export async function checkHealth() {
  const res = await fetch(`${API_BASE}/health`);
  if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
  return res.json();
}

export async function getTodos() {
  const res = await fetch(`${API_BASE}/api/todos`);
  if (!res.ok) throw new Error(`Failed to fetch tasks: ${res.status}`);
  return res.json();
}

export async function createTodo({ title, description, priority }) {
  const res = await fetch(`${API_BASE}/api/todos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, description, priority }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to create task: ${res.status}`);
  }
  return res.json();
}

export async function updateTodo(id, updates) {
  const res = await fetch(`${API_BASE}/api/todos/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error(`Failed to update task: ${res.status}`);
  return res.json();
}

export async function deleteTodo(id) {
  const res = await fetch(`${API_BASE}/api/todos/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`Failed to delete task: ${res.status}`);
  return res.json();
}

// Simulation endpoints
export async function triggerSimLeak(mb = 20) {
  const res = await fetch(`${API_BASE}/simulate/leak?mb=${mb}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Leak failed: ${res.status}`);
  }
  return res.json();
}

export async function triggerSimSlow(ms = 3000) {
  const res = await fetch(`${API_BASE}/simulate/slow?ms=${ms}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Slow simulation failed: ${res.status}`);
  }
  return res.json();
}

export async function triggerSimCrash() {
  const res = await fetch(`${API_BASE}/simulate/crash`);
  if (!res.ok && res.status !== 500) {
    throw new Error(`Crash failed: ${res.status}`);
  }
  return { status: "crashing", message: "Process termination initiated" };
}

export async function getSimStatus() {
  const res = await fetch(`${API_BASE}/simulate/status`);
  if (!res.ok) return null;
  return res.json();
}

export { API_BASE };
