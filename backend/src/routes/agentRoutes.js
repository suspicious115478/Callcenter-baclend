const express = require("express");
const { getStatus, setStatus } = require("../controllers/agentController");
const router = express.Router();

router.get("/status", getStatus);
router.post("/status", setStatus);

module.exports = router;
