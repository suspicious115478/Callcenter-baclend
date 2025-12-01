// socketHandler.js

const { Server } = require("socket.io");
const callController = require("../controllers/callController");
// 🚨 NEW IMPORT: Import agentController to check status in the test loop
const agentController = require("../controllers/agentController"); 

let ioInstance;

exports.setupSocket = (server) => {
  const io = new Server(server, {
    cors: { origin: "https://callcenter-frontend-o9od.onrender.com" } 
  });

  ioInstance = io;

  io.on("connection", (socket) => {
    console.log("Agent connected:", socket.id);

    // 🚨 TEMPORARY TESTING LOOP 🚨
    setInterval(async () => {
      // 1. Check Agent Status
      const status = agentController.getRawStatus();
      
      if (status === 'offline') {
        console.log("[TEST LOOP] Agent is offline. Skipping test call.");
        return; // <--- STOP HERE if offline
      }

      // 2. Proceed only if Online
      const testNumber = "+91987657777"; // Using 10-digit format to match DB
      
      const callData = await callController.checkSubscriptionStatus(testNumber);
      
      socket.emit("incoming-call", {
        caller: testNumber,
        name: callData.userName, 
        subscriptionStatus: callData.subscriptionStatus, 
        dashboardLink: callData.dashboardLink, 
        ticket: callData.ticket
      });
      
      console.log(`[TEST EMIT] Sending call: ${testNumber} with Status: ${callData.subscriptionStatus}`);
      
    }, 30000); // Emits a call every 10 seconds
  });
};

exports.io = () => ioInstance;






