const express = require("express");

// 🚨 MODIFICATION: Make sure to import ALL controller functions!
const { 
    getIncomingCall, 
    createTicket, 
    getAddressByUserId, 
    getAddressByAddressId,
    getAvailableServicemen,
    dispatchServiceman,
    getMemberIdByPhoneNumber,
    getAssignedOrders, 
    cancelOrder, // (For Customer cancellations)
    
    // 🚀 NEW IMPORTS: Employee Help Desk APIs
    getEmployeeDetailsByMobile, // Fetches employee UID
    getActiveDispatchByUserId,  // Fetches active job details
    cancelActiveDispatch,       // For cancelling an active dispatch from the Employee Help Desk
    getDispatchDetailsByOrderId,
    getUserIdByPhoneNumber,
    // 🔥 NEW IMPORT: For fetching dispatch details by Order ID
    getDispatchDetails 
} = require("../controllers/callController"); 

const { io } = require("../socket/socketHandler"); 

const router = express.Router();

// ======================================================================
// --- GET Routes ---
// ======================================================================

// 1. Specific Address Lookup (Must be before :userId)
router.get('/address/lookup/:addressId', getAddressByAddressId);

// 2. User Address List
router.get("/address/:userId", getAddressByUserId);

// 3. Incoming Call Webhook
router.get("/incoming", getIncomingCall(io)); 

// 4. Fetch Assigned Orders (Regular Customer Orders)
router.get("/orders/assigned", getAssignedOrders); 

// 🚀 5. NEW ROUTE: Fetch Employee Details by Mobile Number
router.get("/employee/details", getEmployeeDetailsByMobile); 

// 🚀 6. NEW ROUTE: Fetch Active Dispatch Order by Employee User ID
router.get("/dispatch/active-order", getActiveDispatchByUserId);

// 🔥 7. CRITICAL NEW ROUTE: Fetch Dispatch Details by Order ID
// Purpose: Used by ServiceManSelectionPage for re-dispatching a cancelled order.
router.get("/dispatch/details/:order_id", getDispatchDetails);


// ======================================================================
// --- POST Routes ---
// ======================================================================

// 8. Create Ticket
router.post("/ticket", createTicket);

// 9. Fetch Available Servicemen
router.post("/servicemen/available", getAvailableServicemen);

// 10. Dispatch Serviceman
router.post("/dispatch", dispatchServiceman);

// 11. Fetch Member ID by Phone Number
router.post("/memberid/lookup", getMemberIdByPhoneNumber);


// ======================================================================
// --- PUT Routes ---
// ======================================================================

// 12. Cancel Order (Customer Side)
router.put("/orders/cancel", cancelOrder); 

// 🚀 13. NEW ROUTE: Cancel Active Dispatch (Employee/Agent Side)
router.put("/dispatch/cancel", cancelActiveDispatch);

router.get('/dispatch/details/:orderId', getDispatchDetailsByOrderId);

router.get('/user/lookup', getUserIdByPhoneNumber);


module.exports = router;


