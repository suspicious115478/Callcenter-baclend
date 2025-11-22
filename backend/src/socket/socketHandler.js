// sockethandler.js

const { Server } = require("socket.io");
// 🚨 NEW IMPORT: Get the verification logic
const { checkSubscriptionStatus } = require("./controllers/callController");

let ioInstance;

exports.setupSocket = (server) => {
  const io = new Server(server, {
    cors: { origin: "*" }
  });

  ioInstance = io;

  io.on("connection", (socket) => {
    console.log("Agent connected:", socket.id);

    // 🚨 TEMPORARY TESTING LOOP 🚨
    setInterval(async () => {
      // Define the test number you want to check (verified or unverified)
      const testNumber = "+919876543210"; 
      
      // Use the actual verification function to get dynamic status
      const callData = await checkSubscriptionStatus(testNumber);
      
      // The socket now emits the CORRECT verification result
      socket.emit("incoming-call", {
        caller: testNumber,
        name: callData.userName, // Will be "Verified Subscriber" or "New/Non-Subscriber"
        subscriptionStatus: callData.subscriptionStatus, // Will be "Verified" or "None"
        dashboardLink: callData.dashboardLink, // Will be the correct dashboard or search link
        ticket: callData.ticket
      });
      
      console.log(`[TEST EMIT] Sending call: ${testNumber} with Status: ${callData.subscriptionStatus}`);
      
    }, 10000); // Emits a call every 10 seconds
  });
};

exports.io = () => ioInstance;
