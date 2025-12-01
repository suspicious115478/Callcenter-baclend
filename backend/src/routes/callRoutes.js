// backend/src/routes/callRoutes.js

const express = require("express");

// 🚨 MODIFICATION: Make sure to import the new controller functions!
const { 
    getIncomingCall, 
    createTicket, 
    getAddressByUserId, 
    getAddressByAddressId,
    getAvailableServicemen,
    dispatchServiceman,
    getMemberIdByPhoneNumber,
    // 🚀 NEW IMPORTS REQUIRED FOR THE DASHBOARD LOGIC
    getAssignedOrders,    // <-- You need this function in your controller
    cancelOrder           // <-- You need this function in your controller
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

// 🚀 4. NEW ROUTE: Fetch Assigned Orders
router.get("/orders/assigned", getAssignedOrders); // <-- FIX: Handles /call/orders/assigned?phoneNumber=...


// --- POST Routes ---

// 5. Create Ticket
router.post("/ticket", createTicket);

// 6. Fetch Available Servicemen
router.post("/servicemen/available", getAvailableServicemen);

// 7. Dispatch Serviceman
router.post("/dispatch", dispatchServiceman);

// 8. Fetch Member ID by Phone Number
router.post("/memberid/lookup", getMemberIdByPhoneNumber);


// --- PUT Routes ---

// 🚀 9. NEW ROUTE: Cancel Order
router.put("/orders/cancel", cancelOrder); // <-- FIX: Handles /call/orders/cancel

module.exports = router;
