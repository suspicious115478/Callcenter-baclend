const { createClient } = require('@supabase/supabase-js');
// 🚨 NEW IMPORT: Import the agent controller to check the status
// Ensure the path is correct relative to this file's location (e.g., if controllers are siblings)
const agentController = require('./agentController'); 

// ----------------------------------------------------------------------
// MAIN SUPABASE INITIALIZATION (For User/Subscription Lookup)
// ----------------------------------------------------------------------

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY; 

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Missing main Supabase credentials in environment variables.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ----------------------------------------------------------------------
// LOGGING SUPABASE INITIALIZATION (For Ticket Creation/Call Logs)
// ----------------------------------------------------------------------

const LOG_SUPABASE_URL = process.env.LOG_SUPABASE_URL;
const LOG_SUPABASE_ANON_KEY = process.env.LOG_SUPABASE_ANON_KEY; 

let logSupabase = null;
if (LOG_SUPABASE_URL && LOG_SUPABASE_ANON_KEY) {
    try {
        logSupabase = createClient(LOG_SUPABASE_URL, LOG_SUPABASE_ANON_KEY);
        console.log("Logging Supabase client initialized successfully.");
    } catch (e) {
        console.error("Failed to initialize logging Supabase client:", e.message);
        // Keep logSupabase as null if initialization fails
    }
} else {
    console.warn("Missing LOG_SUPABASE credentials (LOG_SUPABASE_URL or LOG_SUPABASE_ANON_KEY). Ticket creation will be disabled.");
}

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
 * Checks the subscription status of a phone number by first looking up the user_id
 * in 'AllowedNumber' and then checking the 'plan_status' in the 'User' table.
 */
exports.checkSubscriptionStatus = async (phoneNumber) => {
    
    // ✅ MODIFIED LOGIC: Normalization now keeps ALL digits (including country code).
    // E.g., '+919812300001' becomes '919812300001'
    const dbPhoneNumber = phoneNumber.replace(/[^0-9]/g, '');
    
    console.log(`[QUERY 1/2: AllowedNumber] Checking for phone: ${dbPhoneNumber}`);

    try {
        // --- STEP 1: Query the 'AllowedNumber' table for the user_id ---
        const { data: allowedNumbers, error: allowedError } = await supabase
            .from('AllowedNumber')
            .select('user_id') 
            .eq('phone', dbPhoneNumber) // Queries for the full number including country code
            .limit(1);

        if (allowedError) {
            console.error("Supabase AllowedNumber query error:", allowedError.message);
            return handleInactive(dbPhoneNumber, "DB Error");
        }

        const allowedEntry = allowedNumbers ? allowedNumbers[0] : null;

        if (!allowedEntry || !allowedEntry.user_id) {
            console.log(`[QUERY 1/2] RESULT: Phone number ${dbPhoneNumber} NOT found in AllowedNumber table.`);
            return handleInactive(dbPhoneNumber, "Unrecognized Caller");
        }

        const userId = allowedEntry.user_id;
        console.log(`[QUERY 1/2] SUCCESS: Found user_id: ${userId}`);


        // --- STEP 2: Query the 'User' table using the retrieved user_id ---
        console.log(`[QUERY 2/2: User] Checking plan status for user_id: ${userId}`);

        const { data: users, error: userError } = await supabase
            .from('User')
            .select('plan_status, name') 
            .eq('id', userId) // Queries for the user using the user_id from the first query
            .limit(1);

        if (userError) {
            console.error("Supabase User query error:", userError.message);
            return handleInactive(dbPhoneNumber, "DB Error");
        }
        
        const user = users ? users[0] : null;

        // If user is not found in the User table (e.g., deleted account)
        if (!user) {
            console.log(`[QUERY 2/2] RESULT: User NOT Found for user_id ${userId} in User table.`);
            return handleInactive(dbPhoneNumber, "User Data Missing");
        }

        console.log(`[QUERY 2/2] RESULT: User found! Plan Status is '${user.plan_status}'.`);

        // Plan Status Check (Case-insensitive)
        if (user.plan_status && user.plan_status.toLowerCase() === 'active') {
            return {
                hasActiveSubscription: true,
                userName: user.name || "Active Subscriber",
                subscriptionStatus: "Verified",
                dashboardLink: `/user/dashboard/${userId}`, // 🚨 IMPORTANT: Now using user_id in the link
                ticket: "Active Plan Call"
            };
        }

        // Default: Inactive Plan Status
        console.log(`[QUERY 2/2] RESULT: User ${userId} is INACTIVE.`);
        return handleInactive(dbPhoneNumber, user.name || "Inactive Subscriber");
        
    } catch (e) {
        console.error("Supabase lookup exception:", e.message);
        return handleInactive(dbPhoneNumber, "System Error");
    }
};


/**
 * Main handler for the incoming call webhook.
 * 🚨 CRITICAL UPDATE: Checks agent status and blocks call if offline.
 */
exports.getIncomingCall = (ioInstanceGetter) => async (req, res) => {
    
    // 🚨 EXTENSIVE LOGGING: Check Agent Status 
    // This calls the getter function which should also log the status it reads (in agentController.js)
    const currentAgentStatus = agentController.getRawStatus(); 
    
    // 🚨 Log the decision point
    console.log(`[CALL BLOCK CHECK] Call received. Agent Status read as: ${currentAgentStatus}`);
    
    if (currentAgentStatus === 'offline') {
        // Log the block and respond successfully to the caller (e.g., Twilio)
        console.warn("[CALL BLOCKED SUCCESS] Agent is confirmed OFFLINE. Call processing stopped before lookup and socket emit.");
        
        return res.status(200).json({ 
            message: "Agent is offline. Call routed to queue or voicemail.", 
            status: "Agent Offline" 
        });
    }

    // --- Only proceed if the agent is ONLINE ---
    console.log("[CALL PROCEED] Agent is ONLINE. Continuing with user lookup and socket emit.");

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
        console.log(`[SOCKET EMIT] Status: ${callData.subscriptionStatus}. Emitting call data...`);
        ioInstance.emit("incoming-call", callData); // This only runs if status is 'online'
    } else {
        console.warn("Socket.IO instance not available via getter.");
    }
    
    res.status(200).json({
        message: "Call processed, agent notified.",
        status: callData.subscriptionStatus,
        redirect: callData.dashboardLink
    });
};

/**
 * Handles saving agent notes as a new ticket in the separate logging database.
 */
exports.createTicket = async (req, res) => {
    // 1. Check if the logging client was successfully initialized
    if (!logSupabase) {
        console.error('TICKET FAIL: Logging Supabase client is NOT initialized. Check LOG_SUPABASE environment variables.');
        return res.status(500).json({ message: 'Ticket system is offline. Configuration error.' });
    }

    const { phoneNumber, requestDetails } = req.body; 
    const activeAgentId = req.headers['x-agent-id'] || 'AGENT_001'; 

    if (!phoneNumber || !requestDetails) {
        console.error('TICKET FAIL: Missing required data (phone or notes).');
        return res.status(400).json({ message: 'Missing phone number or request details.' });
    }

    try {
        console.log(`TICKET LOG: Attempting to create ticket for ${phoneNumber} by ${activeAgentId}...`);
        
        const { data, error } = await logSupabase
            .from('tickets') // ASSUMING your table is named 'tickets' in the logging Supabase DB
            .insert([
                { 
                    phone_number: phoneNumber,
                    request_details: requestDetails,
                    agent_id: activeAgentId, 
                    status: 'New', 
                    created_at: new Date().toISOString(),
                },
            ])
            .select('id'); // Selects the ID of the new ticket

        if (error) {
            // 🚨 CRITICAL LOGGING: Print the exact Supabase error message
            console.error('TICKET FAIL: Supabase Insertion Error:', error.message);
            // This error often indicates a missing table, column mismatch, or security rule violation.
            return res.status(500).json({ message: 'Database insertion failed.', details: error.message });
        }

        console.log(`TICKET SUCCESS: Created new ticket ID: ${data[0].id}`);
        
        // 🚨 CRITICAL UPDATE: Return the requestDetails and the new ticket ID for frontend redirection
        res.status(201).json({ 
            message: 'Ticket created successfully.', 
            ticket_id: data[0].id,
            requestDetails: requestDetails // Send the notes back for the next page
        });

    } catch (err) {
        // 🚨 CRITICAL LOGGING: Catch unexpected server errors
        console.error('TICKET FAIL: Internal Server Exception:', err.message);
        res.status(500).json({ message: 'Internal server error during ticket creation.' });
    }
};
