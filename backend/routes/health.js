const express = require("express");
const router = express.Router();
const db = require("../db");

// Standardized health check endpoint for K8s liveness and readiness probes
router.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    service: "backend",
    uptime: process.uptime(),
    mongoConnected: db.isMongo(),
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
