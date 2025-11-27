// backend/src/routes/callRoutes.js

const express = require("express");
// 🚨 MODIFICATION: Import all necessary functions including the new getAvailableServicemen
const { 
    getIncomingCall, 
    createTicket, 
    getAddressByUserId, 
    getAddressByAddressId,
    getAvailableServicemen // 🚀 NEW IMPORT
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

// 🚀 5. NEW ROUTE: Fetch Available Servicemen
// This handles the POST request from ServiceManSelectionPage
router.post("/servicemen/available", getAvailableServicemen);


module.exports = router;
