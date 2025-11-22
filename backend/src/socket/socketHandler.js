// sockethandler.js

const { Server } = require("socket.io");
// 🚨 CRITICAL FIX 1: Import the entire module object to prevent the TypeError 
// (Timing issue when circular dependencies exist).
const callController = require("../controllers/callController");

let ioInstance;

exports.setupSocket = (server) => {
  const io = new Server(server, {
    // Use explicit frontend URL for better security and reliability
    cors: { origin: "https://callcenter-frontend-o9od.onrender.com" } 
  });

  ioInstance = io;

  io.on("connection", (socket) => {
    console.log("Agent connected:", socket.id);

    // 🚨 TEMPORARY TESTING LOOP 🚨
    setInterval(async () => {
      // Define the test number you want to check (verified or unverified)
      const testNumber = "+919876543210"; 
      
      // 🚨 CRITICAL FIX 2: Access the function via the module object
      const callData = await callController.checkSubscriptionStatus(testNumber);
      
      // The socket now emits the CORRECT verification result
      socket.emit("incoming-call", {
        caller: testNumber,
        name: callData.userName, 
        subscriptionStatus: callData.subscriptionStatus, 
        dashboardLink: callData.dashboardLink, 
        ticket: callData.ticket
      });
      
      console.log(`[TEST EMIT] Sending call: ${testNumber} with Status: ${callData.subscriptionStatus}`);
      
    }, 10000); // Emits a call every 10 seconds
  });
};

exports.io = () => ioInstance;
