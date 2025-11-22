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
 * 🚨 FIX: Redirects to the NewCallSearchPage route.
 */
const handleInactive = (dbPhoneNumber, name) => ({
    hasActiveSubscription: false,
    userName: name,
    // Status set to "None" to match the original logic for the NewCallSearchPage
    subscriptionStatus: "None", 
    // 🚨 FIX: Corrected Redirection to the existing NewCallSearchPage route
    dashboardLink: `/new-call/search?caller=${dbPhoneNumber}`, 
    ticket: "New Call - Search Required"
});


/**
 * Checks the subscription status of a phone number from the Supabase 'User' table.
 */
exports.checkSubscriptionStatus = async (phoneNumber) => {
    // Normalize the phone number (remove '+' for the Supabase query)
    const dbPhoneNumber = phoneNumber.replace('+', ''); 

    try {
        // Query the 'User' table
        // NOTE: If you still get a 404/no call found, double-check that the column name in Supabase is truly 'phone' and not 'phone_number'.
        const { data: users, error } = await supabase
            .from('User')
            .select('plan_status, name') 
            .eq('phone', dbPhoneNumber)
            .limit(1);

        if (error) {
            console.error("Supabase query error:", error.message);
            return handleInactive(dbPhoneNumber, "DB Error");
        }

        const user = users ? users[0] : null;

        // 1. User Found and Plan is ACTIVE
        if (user && user.plan_status === 'active') {
            return {
                hasActiveSubscription: true,
                userName: user.name || "Active Subscriber",
                subscriptionStatus: "Verified", // Status set to 'Verified' for active users
                dashboardLink: `/user/dashboard/${dbPhoneNumber}`, // Redirect to UserDashboardPage
                ticket: "Active Plan Call"
            };
        }

        // 2. Default: User Not Found or Plan is INACTIVE/Expired -> Redirect to Search Page
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
