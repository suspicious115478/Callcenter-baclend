// backend/src/routes/callRoutes.js

const express = require("express");
// 🚨 MODIFICATION: Import all necessary functions including the new getAvailableServicemen and dispatchServiceman
const { 
    getIncomingCall, 
    createTicket, 
    getAddressByUserId, 
    getAddressByAddressId,
    getAvailableServicemen, // 🚀 NEW IMPORT (Existing)
    dispatchServiceman      // 🚀 NEW IMPORT (From previous update)
} = require("../controllers/callController"); 

const { io } = require("../socket/socketHandler"); 

const router = express.Router();

// --- GET Routes ---

// 1. Specific Address Lookup (Must be before :userId)
router.get('/address/lookup/:addressId', getAddressByAddressId);

// 2. User Address List
router.get("/address/:userId", getAddressByUserId);

// 3. Incoming Call Webhook
router.get("/incoming", getIncomingCall(io)); 


// --- POST Routes ---

// 4. Create Ticket
router.post("/ticket", createTicket);

// 5. Fetch Available Servicemen
router.post("/servicemen/available", getAvailableServicemen);

// 🚀 6. NEW ROUTE: Dispatch Serviceman
// This handles the POST request to assign a job to a serviceman in the Employee DB
router.post("/dispatch", dispatchServiceman);


module.exports = router;
