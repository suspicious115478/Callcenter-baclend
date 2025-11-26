// callRoutes.js

const express = require("express");
// 🚨 CRITICAL FIX 1: Import all necessary functions including the new getAddressDetailsById
const { getIncomingCall, createTicket, getAddressByUserId, getAddressDetailsById } = require("../controllers/callController"); 
// 🚨 CRITICAL FIX 2: Import the io getter function
const { io } = require("../socket/socketHandler"); 
const router = express.Router();

// 🚨 ROUTE: GET endpoint for incoming calls
// This returns the actual Express middleware handler function.
router.get("/incoming", getIncomingCall(io)); 

// 🚨 ROUTE: POST endpoint for creating a support ticket from the agent dashboard
router.post("/ticket", createTicket);

// 🚀 ROUTE: GET endpoint to fetch all addresses for a given user ID
router.get("/address/:userId", getAddressByUserId);

// 🏠 ROUTE: GET endpoint to fetch specific address details by Address ID
// FIX: Using the destructured function name directly (getAddressDetailsById)
// Changed path to include '/call/' for better separation from the previous route.
router.get('/call/address/details/:addressId', getAddressDetailsById);

module.exports = router;
