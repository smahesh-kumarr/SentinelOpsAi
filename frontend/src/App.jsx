import React, { useState, useEffect, useCallback } from "react";
import Navbar from "./components/Navbar";
import MetricsBar from "./components/MetricsBar";
import TaskForm from "./components/TaskForm";
import TaskList from "./components/TaskList";
import SimConsole from "./components/SimConsole";
import { getTodos, createTodo, updateTodo, deleteTodo, checkHealth, getSimStatus } from "./api";

export default function App() {
  const [todos, setTodos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(false);
  const [latency, setLatency] = useState(null);
  const [simStatus, setSimStatus] = useState(null);

  // Poll backend health status
  const pingHealth = useCallback(async () => {
    const start = performance.now();
    try {
      await checkHealth();
      const elapsed = Math.round(performance.now() - start);
      setIsOnline(true);
      setLatency(elapsed);
    } catch {
      setIsOnline(false);
      setLatency(null);
    }
  }, []);

  // Fetch todos from API
  const fetchTodos = useCallback(async () => {
    try {
      const data = await getTodos();
      setTodos(data);
    } catch (err) {
      console.error("Failed to load tasks:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch simulation metrics
  const fetchSim = useCallback(async () => {
    try {
      const status = await getSimStatus();
      if (status) setSimStatus(status);
    } catch {
      // ignore if sim not reachable
    }
  }, []);

  useEffect(() => {
    pingHealth();
    fetchTodos();
    fetchSim();

    // Periodic health check every 4 seconds
    const interval = setInterval(() => {
      pingHealth();
      fetchSim();
    }, 4000);

    return () => clearInterval(interval);
  }, [pingHealth, fetchTodos, fetchSim]);

  const handleAddTask = async (newTask) => {
    const created = await createTodo(newTask);
    setTodos((prev) => [created, ...prev]);
  };

  const handleToggleComplete = async (id, completed) => {
    // Optimistic UI update
    setTodos((prev) =>
      prev.map((t) => (t.id === id ? { ...t, completed } : t))
    );
    try {
      await updateTodo(id, { completed });
    } catch (err) {
      // Revert if error
      console.error(err);
      fetchTodos();
    }
  };

  const handleDeleteTask = async (id) => {
    setTodos((prev) => prev.filter((t) => t.id !== id));
    try {
      await deleteTodo(id);
    } catch (err) {
      console.error(err);
      fetchTodos();
    }
  };

  return (
    <div className="app-container">
      <Navbar isOnline={isOnline} latency={latency} />
      <MetricsBar todos={todos} simStatus={simStatus} />

      <div className="main-layout">
        <main>
          <div className="section-title-bar">
            <h2 className="section-title">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
                <polyline points="10 9 9 9 8 9"/>
              </svg>
              Workload & Tasks
            </h2>
          </div>

          <TaskForm onAddTask={handleAddTask} />
          <TaskList
            todos={todos}
            onToggleComplete={handleToggleComplete}
            onDeleteTask={handleDeleteTask}
            loading={loading}
          />
        </main>

        <aside>
          <SimConsole onSimulationEvent={() => { fetchSim(); pingHealth(); }} />
        </aside>
      </div>
    </div>
  );
}
