// callRoutes.js

const express = require("express");
const { getIncomingCall } = require("../controllers/callController");
// 🚨 CRITICAL FIX 1: Import the io getter function
const { io } = require("../socket/socketHandler"); 
const router = express.Router();

// 🚨 CRITICAL FIX 2: Call getIncomingCall() with the io getter function (io)
// This returns the actual Express middleware handler function.
router.get("/incoming", getIncomingCall(io)); 

module.exports = router;
