// callController.js

const { createClient } = require('@supabase/supabase-js');
// 🚨 IMPORT: Import the sibling agentController to access the status
const agentController = require('./agentController'); 

// ----------------------------------------------------------------------
// SUPABASE INITIALIZATION (SUBSCRIBERS DB)
// ----------------------------------------------------------------------

// 🚨 UPDATED: This controller uses the SUB_ prefix for the Subscriber DB
const SUPABASE_URL = process.env.SUB_SUPABASE_URL; 
const SUPABASE_ANON_KEY = process.env.SUB_SUPABASE_ANON_KEY; 

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    // Note: Updated error message to reflect new variable names
    throw new Error("Missing Subscriber Supabase credentials (SUB_SUPABASE_URL/KEY).");
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
 * Logic: Matches last 10 digits of phone number -> Checks if plan_status is 'active'.
 */
exports.checkSubscriptionStatus = async (phoneNumber) => {
    
    // 1. Strip non-numeric characters
    const rawPhoneNumber = phoneNumber.replace(/[^0-9]/g, '');
    
    // 2. Extract last 10 digits to ensure match with DB format (e.g., '9876543210')
    let dbPhoneNumber = rawPhoneNumber.slice(-10);

    console.log(`[SUPABASE QUERY] Searching for 10-digit number: ${dbPhoneNumber}`);

    try {
        // Query the 'User' table
        const { data: users, error } = await supabase
            .from('User')
            .select('plan_status, name') 
            .eq('phone', dbPhoneNumber) 
            .limit(1);

        if (error) {
            console.error("Supabase query error:", error.message);
            return handleInactive(dbPhoneNumber, "DB Error");
        }

        console.log(`[SUPABASE RESULT] Data received:`, users); 

        const user = users ? users[0] : null;

        // Check if user exists and plan is explicitly 'active' (case-insensitive)
        if (user && user.plan_status && user.plan_status.toLowerCase() === 'active') {
            return {
                hasActiveSubscription: true,
                userName: user.name || "Active Subscriber",
                subscriptionStatus: "Verified",
                dashboardLink: `/user/dashboard/${dbPhoneNumber}`, 
                ticket: "Active Plan Call"
            };
        }

        // Default: User not found OR plan is not active
        return handleInactive(dbPhoneNumber, user ? user.name : "Unrecognized Caller");
        
    } catch (e) {
        console.error("Supabase lookup exception:", e.message);
        return handleInactive(dbPhoneNumber, "System Error");
    }
};


/**
 * Main handler for the incoming call webhook.
 * 🚨 LOGIC FLOW:
 * 1. Check Agent Status (Block if offline)
 * 2. Check Subscription (Supabase)
 * 3. Emit Socket Event (To Frontend)
 */
exports.getIncomingCall = (ioInstanceGetter) => async (req, res) => {
    
    console.log("--------------------------------------------------");
    console.log("[INCOMING CALL] Webhook triggered.");

    // 🚨 STEP 1: Check Agent Status
    const currentAgentStatus = agentController.getRawStatus(); 
    
    if (currentAgentStatus === 'offline') {
        console.warn(`[CALL BLOCKED] Agent Status is '${currentAgentStatus}'. Halting process.`);
        
        // Return successful HTTP response to voice provider, but do NOT emit socket event.
        return res.status(200).json({ 
            message: "Agent is offline. Call ignored.", 
            status: "Agent Offline" 
        });
    }

    console.log(`[CALL PROCEEDING] Agent Status is '${currentAgentStatus}'. Processing call...`);

    // 🚨 STEP 2: Process Subscription
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
     
    // 🚨 STEP 3: Emit to Frontend via Socket
    const ioInstance = ioInstanceGetter();
    if (ioInstance) {
        console.log(`[SOCKET EMIT] Sending event to agent dashboard. Status: ${callData.subscriptionStatus}`);
        ioInstance.emit("incoming-call", callData); 
    } else {
        console.warn("[SOCKET ERROR] Socket.IO instance not found via getter.");
    }
     
    // 🚨 STEP 4: Respond to Webhook
    res.status(200).json({
        message: "Call processed, agent notified.",
        status: callData.subscriptionStatus,
        redirect: callData.dashboardLink
    });
};
