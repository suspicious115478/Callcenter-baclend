// callController.js

// 🚨 NEW IMPORTS: Supabase client
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
 * Helper function for handling inactive/emergency redirection.
 */
const handleInactive = (dbPhoneNumber, name) => ({
    hasActiveSubscription: false,
    userName: name,
    subscriptionStatus: "Inactive",
    // 🚨 NEW REDIRECTION: Emergency Services Only Page
    dashboardLink: `/emergency-services-only?caller=${dbPhoneNumber}`, 
    ticket: "Emergency Services Only"
});


/**
 * Checks the subscription status of a phone number from the Supabase 'User' table.
 * This function is exported for use in the socketHandler for testing.
 * * Logic: 
 * - If plan_status is 'active', redirect to dashboard.
 * - Otherwise (inactive, expired, not found, or error), redirect to emergency page.
 */
exports.checkSubscriptionStatus = async (phoneNumber) => {
    // Normalize the phone number (remove '+' for the Supabase query)
    const dbPhoneNumber = phoneNumber.replace('+', ''); 

    try {
        // Query the 'User' table
        const { data: users, error } = await supabase
            .from('User')
            .select('plan_status, name') 
            .eq('phone', dbPhoneNumber) // ASSUMPTION: Supabase column is 'phone_number'
            .limit(1);

        if (error) {
            console.error("Supabase query error:", error.message);
            // Return inactive status on DB error
            return handleInactive(dbPhoneNumber, "DB Error");
        }

        const user = users ? users[0] : null;

        // 1. User Found and Plan is ACTIVE
        if (user && user.plan_status === 'active') {
            return {
                hasActiveSubscription: true,
                userName: user.name || "Active Subscriber",
                subscriptionStatus: "Active", // Status updated to 'Active'
                dashboardLink: `/user/dashboard/${dbPhoneNumber}`, // Redirect to User Dashboard
                ticket: "Active Plan Call"
            };
        }

        // 2. Default: User Not Found or Plan is INACTIVE/Expired
        return handleInactive(dbPhoneNumber, user ? user.name : "Unrecognized Caller");
        
    } catch (e) {
        console.error("Supabase lookup exception:", e.message);
        return handleInactive(dbPhoneNumber, "System Error");
    }
};


/**
 * Main handler for the incoming call webhook.
 * 🚨 CRITICAL FIX 2: This function accepts the io getter as an argument and returns the Express handler.
 */
exports.getIncomingCall = (ioInstanceGetter) => async (req, res) => {
    // This function remains the main webhook handler, using the exported checker
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
    
    // 🚨 CRITICAL FIX 3: Get the instance using the injected getter function
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
