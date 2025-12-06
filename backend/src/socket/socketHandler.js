// socketHandler.js

const { Server } = require("socket.io");
const callController = require("../controllers/callController");
const agentController = require("../controllers/agentController"); 

let ioInstance;

exports.setupSocket = (server) => {
  const io = new Server(server, {
    cors: { origin: "*" } // Allow all origins for testing, change back to your URL later
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
        return; 
      }

      // ---------------------------------------------------------
      // TEST SCENARIOS (Change this number to test different cases)
      // ---------------------------------------------------------
      const testNumber = "919812300008"; 
      
      console.log(`\n--- [TEST LOOP START] Testing Number: ${testNumber} ---`);

      // 2. ⚠️ CRITICAL CHANGE: Manually run the full logic check here
      // We cannot call 'getIncomingCall' directly because it expects req/res objects.
      // So we will simulate the logic steps here exactly as they are in the controller.
      
      let callData = {};

      // A. Check Employee (Priority 1)
      // Note: We need to access the un-exported helper function logic. 
      // Since we can't easily import private functions, we will rely on a new exported helper
      // OR (Simpler for now) we just assume the controller exposes a "test" function.
      
      // *** BETTER APPROACH FOR TESTING ***
      // Instead of duplicating logic, let's fake a request to the actual controller function
      // by mocking the req/res objects.
      
      const mockReq = { 
        body: { caller: testNumber }, 
        query: {} 
      };
      
      const mockRes = {
        status: (code) => ({
          json: (data) => {
            console.log(`[TEST LOOP] Controller Responded: ${data.status}`);
          }
        })
      };

      // Call the main controller function. 
      // It will run the logic AND emit the socket event automatically because we passed the io getter.
      await callController.getIncomingCall(() => io)(mockReq, mockRes);

      console.log(`--- [TEST LOOP END] ---\n`);
      
    }, 10000); // Emits a test call every 10 seconds
  });
};

exports.io = () => ioInstance;















