exports.getIncomingCall = (req, res) => {
  res.json({
    caller: "+911234567890",
    name: "Test User",
    ticket: "No open tickets"
  });
};
