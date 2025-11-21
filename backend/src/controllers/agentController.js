let agentStatus = "offline";

exports.getStatus = (req, res) => {
  res.json({ status: agentStatus });
};

exports.setStatus = (req, res) => {
  agentStatus = req.body.status;
  res.json({ success: true });
};
