// sockethandler.js

const { Server } = require("socket.io");
const callController = require("../controllers/callController");

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
      // 🟢 FIX: Define the test number in international format.
      // This ensures the normalization logic in callController.js is correctly tested.
      const testNumber = "1234567890"; 
      
      const callData = await callController.checkSubscriptionStatus(testNumber);
      
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

