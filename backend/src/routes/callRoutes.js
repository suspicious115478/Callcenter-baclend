// callRoutes.js

const express = require("express");
// 🚨 MODIFICATION: Import all necessary functions including the new getAddressByUserId and getIncomingCall
const { getIncomingCall, createTicket, getAddressByUserId, getAddressByAddressId } = require("../controllers/callController"); 
// 🚨 CRITICAL FIX 1: Import the io getter function
const { io } = require("../socket/socketHandler"); 

const router = express.Router();
// NOTE: callController is imported but individual functions are already imported above for clarity
// const callController = require('../controllers/callController'); 


// --- 🚀 CRITICAL FIX: REORDERING ---
// 1. Place the most specific route FIRST.
// This ensures that when the server sees /address/lookup/..., it handles it here before the broader route below.
router.get('/address/lookup/:addressId', getAddressByAddressId); // Using destructured function for clean code

// 2. Place the broader, parameterized route SECOND.
// This route will now only catch paths that match /address/:userId (e.g., /address/123) and not the specific /address/lookup/... path.
router.get("/address/:userId", getAddressByUserId);


// 🚨 CRITICAL FIX 2: Call getIncomingCall() with the io getter function (io)
// This returns the actual Express middleware handler function.
router.get("/incoming", getIncomingCall(io)); 

// 🚨 ROUTE: POST endpoint for creating a support ticket from the agent dashboard
// This maps to the createTicket function in the controller
router.post("/ticket", createTicket);


module.exports = router;
