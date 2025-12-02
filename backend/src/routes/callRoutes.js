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
    reassignServiceman,
    
    // 🚀 NEW IMPORTS: Employee Help Desk APIs
    getEmployeeDetailsByMobile, // Fetches employee UID
    getActiveDispatchByUserId,  // Fetches active job details
    cancelActiveDispatch        // <-- NEW: For cancelling an active dispatch from the Employee Help Desk
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
// Purpose: Used by EmployeeHelpDeskPage to get the employee's user_id from their phone number.
router.get("/employee/details", getEmployeeDetailsByMobile); 

// 🚀 6. NEW ROUTE: Fetch Active Dispatch Order by Employee User ID
// Purpose: Used by EmployeeHelpDeskPage to check if the employee has an active job.
router.get("/dispatch/active-order", getActiveDispatchByUserId);


// ======================================================================
// --- POST Routes ---
// ======================================================================

// 7. Create Ticket
router.post("/ticket", createTicket);

// 8. Fetch Available Servicemen
router.post("/servicemen/available", getAvailableServicemen);

// 9. Dispatch Serviceman
router.post("/dispatch", dispatchServiceman);

// 10. Fetch Member ID by Phone Number
router.post("/memberid/lookup", getMemberIdByPhoneNumber);


// ======================================================================
// --- PUT Routes ---
// ======================================================================

// 11. Cancel Order (Customer Side)
// Purpose: Used by UserDashboard to cancel a regular customer request
router.put("/orders/cancel", cancelOrder); 

// 🚀 12. NEW ROUTE: Cancel Active Dispatch (Employee/Agent Side)
// Purpose: Used by EmployeeHelpDeskPage to cancel an active job ticket
router.put("/dispatch/cancel", cancelActiveDispatch);


module.exports = router;

