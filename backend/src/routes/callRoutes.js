// callRoutes.js

const express = require("express");
// 🚨 MODIFICATION: Import all necessary functions including the new getAddressByUserId
const { getIncomingCall, createTicket, getAddressByUserId } = require("../controllers/callController"); 
// 🚨 CRITICAL FIX 1: Import the io getter function
const { io } = require("../socket/socketHandler"); 
const router = express.Router();

// 🚨 CRITICAL FIX 2: Call getIncomingCall() with the io getter function (io)
// This returns the actual Express middleware handler function.
router.get("/incoming", getIncomingCall(io)); 

// 🚨 ROUTE: POST endpoint for creating a support ticket from the agent dashboard
// This maps to the createTicket function in the controller
router.post("/ticket", createTicket);

// 🚀 NEW ROUTE: GET endpoint to fetch all addresses for a given user ID
// Maps to the new getAddressByUserId function in the controller
router.get("/address/:userId", getAddressByUserId);

router.get('/address/details/:addressId', callController.getAddressDetailsById);

module.exports = router;

