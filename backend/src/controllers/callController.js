// callController.js

const { createClient } = require('@supabase/supabase-js');
// NOTE: All Firebase Admin imports and initialization have been removed.

// ----------------------------------------------------------------------
// SUPABASE INITIALIZATION
// ----------------------------------------------------------------------

// Ensure these environment variables are set on your Render Backend Service
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY; 

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Missing Supabase credentials in environment variables.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * Helper function for handling inactive/non-existent users.
 * Redirects to the NewCallSearchPage route.
 */
const handleInactive = (dbPhoneNumber, name) => ({
    hasActiveSubscription: false,
    userName: name,
    subscriptionStatus: "None", 
    // Redirects to the existing NewCallSearchPage route
    dashboardLink: `/new-call/search?caller=${dbPhoneNumber}`, 
    ticket: "New Call - Search Required"
});


/**
 * Checks the subscription status of a phone number from the Supabase 'User' table.
 */
exports.checkSubscriptionStatus = async (phoneNumber) => {
    // 🚨 CRITICAL FIX 1: Normalize the phone number format to match EXACTLY what is in your Supabase 'phone' column.
    // Assuming your Supabase phone numbers DO NOT have a leading '+', we remove it.
    const dbPhoneNumber = phoneNumber.replace('+', ''); 
    
    // If your Supabase table stores the '+' (e.g., '+919876543210'), then change the line above to:
    // const dbPhoneNumber = phoneNumber; 
    
    // Log the number being queried for debug purposes
    console.log(`[SUPABASE QUERY] Checking for phone: ${dbPhoneNumber}`);

    try {
        // Query the 'User' table: Check if the number in the 'phone' column has a plan_status of 'active'.
        const { data: users, error } = await supabase
            .from('User')
            .select('plan_status, name') 
            .eq('phone', dbPhoneNumber) // Column name 'phone'
            .limit(1);

        if (error) {
            console.error("Supabase query error:", error.message);
            return handleInactive(dbPhoneNumber, "DB Error");
        }

        const user = users ? users[0] : null;

        // Check 1: User Found AND Plan is 'active'
        if (user && user.plan_status === 'active') {
            return {
                hasActiveSubscription: true,
                userName: user.name || "Active Subscriber",
                subscriptionStatus: "Verified", // Redirects to UserDashboardPage
                dashboardLink: `/user/dashboard/${dbPhoneNumber}`, 
                ticket: "Active Plan Call"
            };
        }

        // Check 2: User Not Found OR Plan is 'inactive' (or any other status)
        // If user is found but status is not 'active', we treat it as inactive (redirect to search).
        return handleInactive(dbPhoneNumber, user ? user.name : "Unrecognized Caller");
        
    } catch (e) {
        console.error("Supabase lookup exception:", e.message);
        return handleInactive(dbPhoneNumber, "System Error");
    }
};


/**
 * Main handler for the incoming call webhook (remains unchanged).
 */
exports.getIncomingCall = (ioInstanceGetter) => async (req, res) => {
    const incomingNumber = req.body.From || req.query.From || req.body.caller || "+911234567890"; 
  
    const userData = await exports.checkSubscriptionStatus(incomingNumber);
  
    const callData = {
        caller: incomingNumber,
        name: userData.userName,
        subscriptionStatus: userData.subscriptionStatus,
        dashboardLink: userData.dashboardLink,
        ticket: userData.ticket,
        isExistingUser: userData.hasActiveSubscription
    };
    
    const ioInstance = ioInstanceGetter();
    if (ioInstance) {
        console.log(`[VERIFY DEBUG] Status: ${callData.subscriptionStatus}. Redirecting to: ${callData.dashboardLink}`);
        ioInstance.emit("incoming-call", callData);
    } else {
        console.warn("Socket.IO instance not available via getter.");
    }
    
    res.status(200).json({
        message: "Call processed, agent notified.",
        status: callData.subscriptionStatus,
        redirect: callData.dashboardLink
    });
};
