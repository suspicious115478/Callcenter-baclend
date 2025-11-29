// agentController.js

// 🚨 Import the Firebase Realtime Database reference
const { db } = require('../utils/firebaseAdmin'); 

// This variable holds the in-memory state of the agent.
// It defaults to "offline" when the server restarts.
let agentStatus = "offline";

// Log immediately when this module is loaded to confirm initialization.
console.log(`[AGENT MODULE INIT] Module loaded. Initial Status: ${agentStatus}`);

// --- NEW/UPDATED: Agent Registration Handler ---
/**
 * API Handler: POST /agent/register
 * Handles the storage of agent details in Firebase Realtime Database.
 */
const registerAgent = async (req, res) => {
    const { firebase_uid, email, agent_id, admin_id } = req.body;

    if (!firebase_uid || !email || !agent_id || !admin_id) {
        console.error('[AGENT REGISTER ERROR] Missing required registration fields.');
        return res.status(400).json({ message: 'Missing required registration fields.' });
    }

    try {
        // 1. Define the path for the agent data in Realtime DB (e.g., agents/FIREBASE_UID)
        // Using the Firebase UID as the key is the best practice for user-specific data.
        const agentRef = db.ref(`agents/${firebase_uid}`);

        // 2. Set the agent data
        await agentRef.set({
            email, 
            agent_id, 
            admin_id, 
            is_active: true, // Default status for new agents
            last_login: new Date().toISOString(),
        });
        
        console.log(`[AGENT REGISTER SUCCESS] Agent ${agent_id} registered under Admin ${admin_id} in Firebase RTDB.`);

        res.status(201).json({ 
            message: 'Agent profile created successfully in Firebase RTDB.',
            agent: { firebase_uid, agent_id }
        });

    } catch (error) {
        console.error('Backend Agent Registration Error:', error);
        res.status(500).json({ message: 'Failed to register agent details in Firebase RTDB.', details: error.message });
    }
};


// --- EXISTING: Agent Status Handlers (No change to logic, just refactored for module.exports) ---
/**
 * API Handler: GET /agent/status
 * Returns the current status to the frontend dashboard.
 */
const getStatus = (req, res) => {
    console.log(`[API GET STATUS] Request received. Current status: ${agentStatus}`);
    res.json({ status: agentStatus });
};

/**
 * API Handler: POST /agent/status
 * Updates the status based on the frontend button click.
 */
const setStatus = (req, res) => {
    const newStatus = req.body.status;

    // Validate input
    if (newStatus === 'online' || newStatus === 'offline') {
        console.log(`[API SET STATUS] Changing status from '${agentStatus}' to '${newStatus}'`);
        
        // Update the global variable
        agentStatus = newStatus;
        
        console.log(`[API SET SUCCESS] Agent is now: ${agentStatus}`);
        return res.json({ success: true });
    }

    console.error(`[API SET ERROR] Invalid status received: ${newStatus}`);
    res.status(400).json({ success: false, message: "Invalid status" });
};

/**
 * INTERNAL EXPORT: getRawStatus
 * This function is NOT an Express handler. 
 */
const getRawStatus = () => {
    console.log(`[INTERNAL STATUS READ] Validating agent status... Current value: ${agentStatus}`);
    return agentStatus;
};


module.exports = {
    getStatus,
    setStatus,
    getRawStatus,
    // 🚨 Export the new registration function
    registerAgent,
};
