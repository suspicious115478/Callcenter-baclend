const express = require("express");
// 🚀 FIX: Import the new createOrder function
const { 
    getIncomingCall, 
    createTicket, 
    createOrder, // 🚀 NEW IMPORT: Controller function to handle explicit Order creation
    getAddressByUserId, 
    getAddressByAddressId,
    getAvailableServicemen,
    dispatchServiceman      
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

// 4. Create Ticket (First step, returns ticket_id)
router.post("/ticket", createTicket);

// 🚀 5. NEW ROUTE: Create Order (Second step, returns order_id)
// The frontend calls this after the ticket is created, passing ticketId and addressId.
router.post("/order", createOrder);

// 6. Fetch Available Servicemen
router.post("/servicemen/available", getAvailableServicemen);

// 7. Dispatch Serviceman
router.post("/dispatch", dispatchServiceman);


module.exports = router;
