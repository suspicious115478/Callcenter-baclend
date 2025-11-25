// callController.js

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
    logSupabase = createClient(LOG_SUPABASE_URL, LOG_SUPABASE_ANON_KEY);
    console.log("Logging Supabase client initialized.");
} else {
    console.warn("Missing LOG_SUPABASE credentials. Ticket creation will be disabled.");
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
 * Checks the subscription status of a phone number from the Supabase 'User' table.
 */
exports.checkSubscriptionStatus = async (phoneNumber) => {
    
    // Normalization to 10-digit format (e.g., '+911234567890' -> '1234567890')
    const rawPhoneNumber = phoneNumber.replace(/[^0-9]/g, '');
    let dbPhoneNumber = rawPhoneNumber.slice(-10);

    console.log(`[QUERY 1/4] Checking for phone: ${dbPhoneNumber}`);

    try {
        // Query the 'User' table
        const { data: users, error } = await supabase
            .from('User')
            .select('plan_status, name') 
            .eq('phone', dbPhoneNumber) // Queries for the 10-digit number
            .limit(1);

        if (error) {
            console.error("Supabase query error:", error.message);
            return handleInactive(dbPhoneNumber, "DB Error");
        }

        // 🚨 DETAILED LOGGING 🚨
        console.log(`[QUERY 2/4] Raw Supabase Data Received:`, users); 

        const user = users ? users[0] : null;

        // Check 3/4: Did we find a user?
        if (!user) {
            console.log(`[QUERY 3/4] RESULT: User NOT Found for ${dbPhoneNumber}.`);
        } else {
            console.log(`[QUERY 3/4] RESULT: User found! Plan Status is '${user.plan_status}'.`);
        }


        // Plan Status Check (Case-insensitive)
        if (user && user.plan_status && user.plan_status.toLowerCase() === 'active') {
            return {
                hasActiveSubscription: true,
                userName: user.name || "Active Subscriber",
                subscriptionStatus: "Verified",
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
    if (!logSupabase) {
        console.error('Ticket creation failed: Logging Supabase client is not initialized.');
        return res.status(500).json({ message: 'Ticket system offline. Please check logs for LOG_SUPABASE configuration.' });
    }

    const { phoneNumber, requestDetails } = req.body; 
    // Agent ID should ideally come from a session/auth token, but using a placeholder for now
    const activeAgentId = req.headers['x-agent-id'] || 'AGENT_001'; 

    if (!phoneNumber || !requestDetails) {
        return res.status(400).json({ message: 'Missing phone number or request details.' });
    }

    try {
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
            console.error('Supabase error creating ticket:', error.message);
            return res.status(500).json({ message: 'Database error creating ticket.', details: error.message });
        }

        res.status(201).json({ 
            message: 'Ticket created successfully.', 
            ticket_id: data[0].id // Return the created ticket ID
        });

    } catch (err) {
        console.error('Server exception during ticket creation:', err.message);
        res.status(500).json({ message: 'Internal server error.' });
    }
};
