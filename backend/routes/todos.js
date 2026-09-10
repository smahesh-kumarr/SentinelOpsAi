const express = require("express");
const router = express.Router();
const db = require("../db");
const logger = require("../logger");

// GET /api/todos - List all tasks
router.get("/", async (req, res) => {
  try {
    const todos = await db.getTodos();
    res.json(todos);
  } catch (err) {
    logger.error("Failed to fetch todos", { error: err.message });
    res.status(500).json({ error: "Failed to fetch tasks" });
  }
});

// POST /api/todos - Create a new task
router.post("/", async (req, res) => {
  const { title, description, priority } = req.body;
  if (!title || typeof title !== "string" || !title.trim()) {
    return res.status(400).json({ error: "Task title is required" });
  }

  try {
    const newTodo = await db.createTodo({
      title: title.trim(),
      description: description ? description.trim() : "",
      priority: ["low", "medium", "high"].includes(priority) ? priority : "medium",
    });
    logger.info("Created new task", { todoId: newTodo.id, title: newTodo.title });
    res.status(201).json(newTodo);
  } catch (err) {
    logger.error("Failed to create task", { error: err.message });
    res.status(500).json({ error: "Failed to create task" });
  }
});

// PUT /api/todos/:id - Update an existing task
router.put("/:id", async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  try {
    const updated = await db.updateTodo(id, updates);
    if (!updated) {
      return res.status(404).json({ error: `Task #${id} not found` });
    }
    logger.info("Updated task", { todoId: id, updates });
    res.json(updated);
  } catch (err) {
    logger.error("Failed to update task", { todoId: id, error: err.message });
    res.status(500).json({ error: "Failed to update task" });
  }
});

// DELETE /api/todos/:id - Remove a task
router.delete("/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const deleted = await db.deleteTodo(id);
    if (!deleted) {
      return res.status(404).json({ error: `Task #${id} not found` });
    }
    logger.info("Deleted task", { todoId: id });
    res.json({ message: `Task #${id} deleted successfully`, id });
  } catch (err) {
    logger.error("Failed to delete task", { todoId: id, error: err.message });
    res.status(500).json({ error: "Failed to delete task" });
  }
});

module.exports = router;
