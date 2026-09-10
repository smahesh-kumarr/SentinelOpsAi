import React, { useState } from "react";

export default function TaskList({ todos, onToggleComplete, onDeleteTask, loading }) {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  const filteredTodos = todos.filter((todo) => {
    if (filter === "active" && todo.completed) return false;
    if (filter === "completed" && !todo.completed) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        todo.title.toLowerCase().includes(q) ||
        (todo.description && todo.description.toLowerCase().includes(q))
      );
    }
    return true;
  });

  return (
    <div>
      <div className="filter-bar">
        <div className="filter-group">
          <button
            className={`filter-btn ${filter === "all" ? "active" : ""}`}
            onClick={() => setFilter("all")}
          >
            All ({todos.length})
          </button>
          <button
            className={`filter-btn ${filter === "active" ? "active" : ""}`}
            onClick={() => setFilter("active")}
          >
            Active ({todos.filter((t) => !t.completed).length})
          </button>
          <button
            className={`filter-btn ${filter === "completed" ? "active" : ""}`}
            onClick={() => setFilter("completed")}
          >
            Completed ({todos.filter((t) => t.completed).length})
          </button>
        </div>

        <input
          type="text"
          className="input-primary"
          style={{ width: "240px", padding: "6px 12px", fontSize: "0.85rem" }}
          placeholder="Filter by keyword..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="empty-state">Loading tasks from cluster...</div>
      ) : filteredTodos.length === 0 ? (
        <div className="glass-panel empty-state">
          <p style={{ fontSize: "0.95rem", color: "var(--text-secondary)" }}>
            {search ? "No matching tasks found." : "No tasks in this view."}
          </p>
          <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "4px" }}>
            Add a new task using the form above.
          </p>
        </div>
      ) : (
        <div className="task-list">
          {filteredTodos.map((todo) => (
            <div
              key={todo.id}
              className={`task-item ${todo.completed ? "completed" : ""}`}
            >
              <div className="task-left">
                <div
                  className={`custom-checkbox ${todo.completed ? "checked" : ""}`}
                  onClick={() => onToggleComplete(todo.id, !todo.completed)}
                  title={todo.completed ? "Mark as active" : "Mark as complete"}
                >
                  {todo.completed && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  )}
                </div>

                <div className="task-details">
                  <span className={`task-title ${todo.completed ? "done" : ""}`}>
                    {todo.title}
                  </span>
                  {todo.description && (
                    <span className="task-desc">{todo.description}</span>
                  )}
                </div>
              </div>

              <div className="task-right">
                <span className={`badge badge-${todo.priority || "medium"}`}>
                  {todo.priority || "medium"}
                </span>

                <button
                  className="btn-icon-danger"
                  onClick={() => onDeleteTask(todo.id)}
                  title="Delete task"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
