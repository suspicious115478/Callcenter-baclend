// src/routes/logRoutes.js

const express = require("express");
const { saveRequestLog } = require("../controllers/logController");
const router = express.Router();

// POST /api/logs/save
router.post("/save", saveRequestLog);

module.exports = router;
