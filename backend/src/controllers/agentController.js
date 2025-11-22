// agentController.js (UPDATED with extensive logging)

let agentStatus = "offline";
console.log(`[STATUS INIT] Initial agentStatus is: ${agentStatus}`);

exports.getStatus = (req, res) => {
  console.log(`[STATUS GET API] Responding to GET with current status: ${agentStatus}`);
  return res.json({ status: agentStatus });
};

exports.setStatus = (req, res) => {
  const newStatus = req.body.status;
  
  if (newStatus === 'online' || newStatus === 'offline') {
    // 🚨 Log the change
    console.log(`[STATUS SET API] Received request to change status from ${agentStatus} to ${newStatus}`);
    agentStatus = newStatus;
    console.log(`[STATUS SET SUCCESS] Agent status updated to: ${agentStatus}`);
    return res.json({ success: true });
  }
  
  console.error(`[STATUS SET ERROR] Invalid status received: ${newStatus}`);
  return res.status(400).json({ success: false, message: "Invalid status" });
};

// 🚨 Function for other controllers (like callController) to read the status directly
exports.getRawStatus = () => {
    console.log(`[STATUS READ] callController is reading agentStatus: ${agentStatus}`);
    return agentStatus; 
};
