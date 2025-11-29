// agentController.js

// This variable holds the in-memory state of the agent.
// It defaults to "offline" when the server restarts.
let agentStatus = "offline";

// Log immediately when this module is loaded to confirm initialization.
console.log(`[AGENT MODULE INIT] Module loaded. Initial Status: ${agentStatus}`);

/**
 * API Handler: GET /agent/status
 * Returns the current status to the frontend dashboard.
 */
exports.getStatus = (req, res) => {
  console.log(`[API GET STATUS] Request received. Current status: ${agentStatus}`);
  res.json({ status: agentStatus });
};

/**
 * API Handler: POST /agent/status
 * Updates the status based on the frontend button click.
 */
exports.setStatus = (req, res) => {
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
 * It allows other internal controllers (like callController) to read the status variable directly.
 */
exports.getRawStatus = () => {
  // We log this read access to prove the callController is accessing the correct memory reference.
  console.log(`[INTERNAL STATUS READ] Validating agent status... Current value: ${agentStatus}`);
  return agentStatus;
};
