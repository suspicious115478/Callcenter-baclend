// src/routes/agentRoutes.js

const express = require("express");
const { getStatus, setStatus, registerAgent } = require("../controllers/agentController"); // 🚨 Import registerAgent
const router = express.Router();

// --- Agent Status Routes ---
router.get("/status", getStatus);
router.post("/status", setStatus);

// --- NEW: Agent Registration Route (Public) ---
router.post("/register", registerAgent);

module.exports = router;
