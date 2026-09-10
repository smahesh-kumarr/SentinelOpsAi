import React, { useState } from "react";

export default function TaskForm({ onAddTask }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsSubmitting(true);
    setError(null);
    try {
      await onAddTask({ title, description, priority });
      setTitle("");
      setDescription("");
      setPriority("medium");
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="glass-panel task-form-panel">
      <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "12px", color: "var(--text-primary)" }}>
        Add New Task
      </h3>
      {error && (
        <div style={{ padding: "8px 12px", marginBottom: "12px", background: "var(--danger-bg)", color: "var(--danger)", borderRadius: "var(--radius-sm)", fontSize: "0.82rem" }}>
          {error}
        </div>
      )}
      <form onSubmit={handleSubmit}>
        <div className="form-row">
          <input
            type="text"
            className="input-primary"
            placeholder="Task summary / action item..."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={isSubmitting}
            required
          />
          <select
            className="select-priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            disabled={isSubmitting}
          >
            <option value="low">Low Priority</option>
            <option value="medium">Medium</option>
            <option value="high">High Priority</option>
          </select>
          <button type="submit" className="btn-primary" disabled={isSubmitting || !title.trim()}>
            {isSubmitting ? "Adding..." : "+ Add"}
          </button>
        </div>
        <input
          type="text"
          className="input-primary"
          placeholder="Detailed description or context (optional)..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={isSubmitting}
        />
      </form>
    </div>
  );
}
