// callController.js

const { createClient } = require('@supabase/supabase-js');
// NOTE: All Firebase Admin imports and initialization have been removed.

// ----------------------------------------------------------------------
// SUPABASE INITIALIZATION
// ----------------------------------------------------------------------

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY; 

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Missing Supabase credentials in environment variables.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * Helper function for handling inactive/non-existent users.
 */
const handleInactive = (dbPhoneNumber, name) => ({
    hasActiveSubscription: false,
    userName: name,
    subscriptionStatus: "None", 
    dashboardLink: `/new-call/search?caller=${dbPhoneNumber}`, 
    ticket: "New Call - Search Required"
});


/**
 * Checks the subscription status of a phone number from the Supabase 'User' table.
 */
exports.checkSubscriptionStatus = async (phoneNumber) => {
    
    // 🚨 FINAL FIX: Normalization to 10-digit format to match the DB exactly.
    // 1. Strip all non-digit characters (e.g., '+919876543210' -> '919876543210').
    const rawPhoneNumber = phoneNumber.replace(/[^0-9]/g, '');
    
    // 2. Extract the last 10 digits to query against the DB (e.g., '919876543210' -> '9876543210').
    // This handles both the full international format and the 10-digit test number.
    let dbPhoneNumber = rawPhoneNumber.slice(-10);

    console.log(`[SUPABASE QUERY] Checking for phone: ${dbPhoneNumber}`);

    try {
        // Query the 'User' table
        const { data: users, error } = await supabase
            .from('User')
            .select('plan_status, name') 
            .eq('phone', dbPhoneNumber) // Now queries for the 10-digit number '9876543210'
            .limit(1);

        if (error) {
            console.error("Supabase query error:", error.message);
            return handleInactive(dbPhoneNumber, "DB Error");
        }

        const user = users ? users[0] : null;

        // Plan Status Check (Case-insensitive, confirmed 'active' is the value)
        if (user && user.plan_status && user.plan_status.toLowerCase() === 'active') {
            return {
                hasActiveSubscription: true,
                userName: user.name || "Active Subscriber",
                subscriptionStatus: "Verified", // Redirects to UserDashboardPage
                dashboardLink: `/user/dashboard/${dbPhoneNumber}`, 
                ticket: "Active Plan Call"
            };
        }

        // Default: Not Found or Inactive
        return handleInactive(dbPhoneNumber, user ? user.name : "Unrecognized Caller");
        
    } catch (e) {
        console.error("Supabase lookup exception:", e.message);
        return handleInactive(dbPhoneNumber, "System Error");
    }
};


// ... (getIncomingCall function unchanged) ...
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

