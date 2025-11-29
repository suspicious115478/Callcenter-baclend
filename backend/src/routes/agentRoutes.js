// src/routes/agentRoutes.js

const express = require("express");
const { 
    getStatus, 
    setStatus, 
    registerAgent,
    // 🔥 IMPORT NEW FUNCTION
    getAdminIdByFirebaseUid 
} = require("../controllers/agentController"); 
const router = express.Router();

// --- Agent Status Routes ---
router.get("/status", getStatus);
router.post("/status", setStatus);

// --- NEW: Agent Registration Route (Public) ---
router.post("/register", registerAgent);

// --- 🔥 NEW ROUTE: Fetch Admin ID ---
// Matches the frontend's fetch: /agent/adminid/{firebaseUid}
router.get("/adminid/:firebaseUid", getAdminIdByFirebaseUid); 


module.exports = router;
