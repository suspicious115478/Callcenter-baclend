// agentController.js (UPDATED)

let agentStatus = "offline";

exports.getStatus = (req, res) => {
  res.json({ status: agentStatus });
};

exports.setStatus = (req, res) => {
  // Ensure we are setting a valid status before updating
  const newStatus = req.body.status;
  if (newStatus === 'online' || newStatus === 'offline') {
    agentStatus = newStatus;
    console.log(`[AGENT STATUS] Agent status updated to: ${agentStatus}`);
    return res.json({ success: true });
  }
  return res.status(400).json({ success: false, message: "Invalid status" });
};

// 🚨 NEW EXPORT: Function for other controllers to read the status directly
exports.getRawStatus = () => agentStatus;
