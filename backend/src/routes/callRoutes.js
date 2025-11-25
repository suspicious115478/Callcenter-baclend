// callRoutes.js

const express = require("express");
// 🚨 MODIFICATION: Import the new createTicket function
const { getIncomingCall, createTicket } = require("../controllers/callController"); 
// 🚨 CRITICAL FIX 1: Import the io getter function
const { io } = require("../socket/socketHandler"); 
const router = express.Router();

// 🚨 CRITICAL FIX 2: Call getIncomingCall() with the io getter function (io)
// This returns the actual Express middleware handler function.
router.get("/incoming", getIncomingCall(io)); 

// 🚨 NEW ROUTE: POST endpoint for creating a support ticket from the agent dashboard
// This maps to the createTicket function in the controller
router.post("/ticket", createTicket);

module.exports = router;

