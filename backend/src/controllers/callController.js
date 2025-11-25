const { createClient } = require('@supabase/supabase-js');
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
    ticket: "New Call - Search Required",
    addresses: [], // Include addresses array
});


// ----------------------------------------------------------------------
// NEW CENTRALIZED DATA FETCHING FUNCTION
// ----------------------------------------------------------------------

/**
 * Fetches user details (name, plan_status) and all associated addresses.
 */
const fetchUserAndAddressData = async (userId) => {
    // --- QUERY 2/3: Query the 'User' table
    console.log(`[QUERY 2/3 - User] Searching 'User' table for status and name using user_id: ${userId}`);

    // Note: We are selecting 'name' and 'plan_status' from the 'User' table
    const { data: users, error: userError } = await supabase
        .from('User')
        .select('plan_status, name') 
        .eq('user_id', userId)
        .limit(1);

    if (userError) {
        console.error("[QUERY 2/3 ERROR] Supabase User query error:", userError.message);
        // Throw an error to be caught by the caller for graceful failure
        throw new Error("User query failed."); 
    }
    
    const user = users ? users[0] : null;

    if (!user) {
        console.log(`[QUERY 2/3 FAILURE] User ID ${userId} NOT found in User table.`);
        return { user: null, addresses: [] };
    }
    
    // --- QUERY 3/3: Query the 'Address' table
    console.log(`[QUERY 3/3 - Address] Searching 'Address' table for addresses using user_id: ${userId}`);

    // Note: The frontend expects 'address_line' and uses the address text directly as the selected option value.
    const { data: addresses, error: addressError } = await supabase
        .from('Address')
        .select('address_line') // <<< CORRECTED: Only selecting 'address_line' as requested.
        .eq('user_id', userId);
        
    if (addressError) {
        console.error("[QUERY 3/3 ERROR] Supabase Address query error:", addressError.message);
        // Continue even if addresses fail, but log the error
        return { user, addresses: [] };
    }

    console.log(`[QUERY 3/3 SUCCESS] Retrieved ${addresses.length} addresses.`);
    
    // Return only the address line texts for the frontend for now
    return { user, addresses: addresses.map(a => a.address_line) };
};

/**
 * Checks the subscription status of a phone number by first looking up the user_id
 * in 'AllowedNumber' and then checking the 'plan_status' in the 'User' table.
 */
exports.checkSubscriptionStatus = async (phoneNumber) => {
    
    // Normalization to keep ALL digits (including country code).
    const dbPhoneNumber = phoneNumber.replace(/[^0-9]/g, '');
    
    console.log(`[SUBSCRIPTION CHECK] Starting lookup for incoming number: ${phoneNumber}. Normalized DB format: ${dbPhoneNumber}`);

    try {
        // --- STEP 1: Query the 'AllowedNumber' table for the user_id ---
        console.log(`[QUERY 1/3 - AllowedNumber] Searching 'AllowedNumber' table for phone: ${dbPhoneNumber}`);
        
        const { data: allowedNumbers, error: allowedError } = await supabase
            .from('AllowedNumber')
            .select('user_id') 
            .eq('phone_number', dbPhoneNumber) 
            .limit(1);

        if (allowedError) {
            console.error("[QUERY 1/3 ERROR] Supabase AllowedNumber query error:", allowedError.message);
            return handleInactive(dbPhoneNumber, "DB Error");
        }

        const allowedEntry = allowedNumbers ? allowedNumbers[0] : null;
        console.log("[QUERY 1/3 RESULT] Raw AllowedNumber Data:", allowedNumbers);

        if (!allowedEntry || !allowedEntry.user_id) {
            console.log(`[QUERY 1/3 FAILURE] Phone number ${dbPhoneNumber} NOT found in AllowedNumber table. Treating as Unrecognized Caller.`);
            return handleInactive(dbPhoneNumber, "Unrecognized Caller");
        }

        const userId = allowedEntry.user_id;
        console.log(`[QUERY 1/3 SUCCESS] Retrieved user_id: ${userId}`);


        // --- STEP 2 & 3: Fetch User and Addresses
        const { user, addresses } = await fetchUserAndAddressData(userId);
        console.log("[QUERY 2/3 & 3/3 RESULT] Raw User Data:", user ? { ...user, addresses } : null);

        // Check if user data exists for the retrieved ID
        if (!user) {
            console.log(`[QUERY 2/3 FAILURE] User ID ${userId} NOT found in User table.`);
            return handleInactive(dbPhoneNumber, "User Data Missing");
        }

        console.log(`[STATUS CHECK] User ID ${userId} found! Plan Status is '${user.plan_status}'.`);

        // Plan Status Check (Case-insensitive)
        if (user.plan_status && user.plan_status.toLowerCase() === 'active') {
            console.log(`[FINAL RESULT] Status ACTIVE. Preparing dashboard link with userId: ${userId}`);
            return {
                hasActiveSubscription: true,
                userName: user.name || "Active Subscriber",
                subscriptionStatus: user.plan_status,
                dashboardLink: `/user/dashboard/${userId}`, // Using user_id for dashboard link
                ticket: "Active Plan Call",
                addresses: addresses, // Include the fetched addresses
            };
        }

        // Default: Inactive Plan Status
        console.log(`[FINAL RESULT] Status INACTIVE. Returning inactive handler.`);
        return handleInactive(dbPhoneNumber, user.name || "Inactive Subscriber");
        
    } catch (e) {
        console.error("[LOOKUP EXCEPTION] General Supabase lookup exception:", e.message);
        return handleInactive(dbPhoneNumber, "System Error");
    }
};

// ----------------------------------------------------------------------
// NEW ENDPOINT FOR REACT FRONTEND TO FETCH DATA
// ----------------------------------------------------------------------

/**
 * Endpoint for the React dashboard to fetch user details and addresses on page load.
 */
exports.getDashboardData = async (req, res) => {
    const userId = req.params.userId;
    if (!userId) {
        return res.status(400).json({ message: "Missing User ID in path." });
    }

    try {
        const { user, addresses } = await fetchUserAndAddressData(userId);

        if (!user) {
             return res.status(404).json({ message: `User ID ${userId} not found.` });
        }

        // Return the required data for the dashboard
        return res.status(200).json({
            userId,
            name: user.name,
            planStatus: user.plan_status,
            addresses: addresses,
        });

    } catch (e) {
        console.error("Dashboard Data Fetch Exception:", e.message);
        return res.status(500).json({ message: "Failed to fetch user data.", details: e.message });
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
        isExistingUser: userData.hasActiveSubscription,
        // CRITICAL: Include addresses in the emitted data
        addresses: userData.addresses, 
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

    // CRITICAL: Destructure selectedAddress from the body
    const { phoneNumber, requestDetails, selectedAddress } = req.body; 
    const activeAgentId = req.headers['x-agent-id'] || 'AGENT_001'; 

    if (!phoneNumber || !requestDetails) {
        console.error('TICKET FAIL: Missing required data (phone or notes).');
        return res.status(400).json({ message: 'Missing phone number or request details.' });
    }

    try {
        console.log(`TICKET LOG: Attempting to create ticket for ${phoneNumber} by ${activeAgentId}...`);
        
        // Append selected address to request details for logging/clarity
        const fullRequestDetails = selectedAddress 
            ? `${requestDetails}\n\n[Address Selected: ${selectedAddress}]`
            : requestDetails;

        const { data, error } = await logSupabase
            .from('tickets') // ASSUMING your table is named 'tickets' in the logging Supabase DB
            .insert([
                { 
                    phone_number: phoneNumber,
                    request_details: fullRequestDetails, // Use the enriched details
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
            requestDetails: fullRequestDetails, // Send the notes back for the next page
            selectedAddress: selectedAddress, // Send the address back for the next page
        });

    } catch (err) {
        // 🚨 CRITICAL LOGGING: Catch unexpected server errors
        console.error('TICKET FAIL: Internal Server Exception:', err.message);
        res.status(500).json({ message: 'Internal server error during ticket creation.' });
    }
};
