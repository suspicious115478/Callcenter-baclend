const { createClient } = require('@supabase/supabase-js');
const agentController = require('./agentController');

// ======================================================================
// 1. MAIN SUPABASE (User/Subscription Lookup)
// ======================================================================
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error("FATAL ERROR: Missing main Supabase credentials.");
    throw new Error("Missing main Supabase credentials in environment variables.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
console.log("Main Supabase client initialized.");

// ======================================================================
// 2. LOGGING SUPABASE (Ticket Creation/Logs)
// ======================================================================
const LOG_SUPABASE_URL = process.env.LOG_SUPABASE_URL;
const LOG_SUPABASE_ANON_KEY = process.env.LOG_SUPABASE_ANON_KEY;

let logSupabase = null;
if (LOG_SUPABASE_URL && LOG_SUPABASE_ANON_KEY) {
    try {
        logSupabase = createClient(LOG_SUPABASE_URL, LOG_SUPABASE_ANON_KEY);
        console.log("Logging Supabase client initialized successfully.");
    } catch (e) {
        console.error("Failed to initialize logging Supabase client:", e.message);
    }
} else {
    console.warn("Missing LOG_SUPABASE credentials. Ticket creation will be disabled.");
}

// ======================================================================
// 3. EMPLOYEE SUPABASE (Servicemen Lookup/Dispatch) 🚀 CRITICAL
// ======================================================================
const EMP_SUPABASE_URL = process.env.EMP_SUPABASE_URL;
const EMP_SUPABASE_ANON_KEY = process.env.EMP_SUPABASE_ANON_KEY;

let empSupabase = null;
if (EMP_SUPABASE_URL && EMP_SUPABASE_ANON_KEY) {
    try {
        empSupabase = createClient(EMP_SUPABASE_URL, EMP_SUPABASE_ANON_KEY);
        console.log("✅ Employee Supabase client initialized successfully.");
    } catch (e) {
        console.error("❌ Failed to initialize Employee Supabase client:", e.message);
    }
} else {
    console.warn("⚠️ Missing EMP_SUPABASE credentials. Serviceman lookup/dispatch will fail.");
}

// ----------------------------------------------------------------------
// HELPER FUNCTIONS
// ----------------------------------------------------------------------

const handleInactive = (dbPhoneNumber, name) => ({
    hasActiveSubscription: false,
    userName: name,
    subscriptionStatus: "None", 
    dashboardLink: `/new-call/search?caller=${dbPhoneNumber}`, 
    ticket: "New Call - Search Required"
});

// ----------------------------------------------------------------------
// CONTROLLER FUNCTIONS
// ----------------------------------------------------------------------

/**
 * 🚀 NEW/UPDATED: Fetches the userId and member_id from the AllowedNumber table based on phone number.
 * This function specifically supports the UserDashboardPage's initial data fetch.
 * * Logic flow: Phone Number -> (AllowedNumber) -> User ID & Member ID
 */
exports.getUserInfoByPhoneNumber = async (req, res) => {
    const { phoneNumber } = req.params;
    const dbPhoneNumber = phoneNumber ? phoneNumber.replace(/[^0-9]/g, '') : null;
    console.log(`[USER INFO LOOKUP] Phone: ${dbPhoneNumber}`);

    if (!dbPhoneNumber) {
        return res.status(400).json({ message: 'Missing phone number.' });
    }

    try {
        // STEP 1: Check AllowedNumber for user_id and member_id
        const { data: allowedNumbers, error: allowedError } = await supabase
            .from('AllowedNumber')
            .select('user_id, member_id') 
            .eq('phone_number', dbPhoneNumber) 
            .limit(1);

        if (allowedError) {
            console.error("[USER INFO ERROR]", allowedError.message);
            return res.status(500).json({ message: 'DB Error', details: allowedError.message });
        }

        const allowedEntry = allowedNumbers ? allowedNumbers[0] : null;

        if (!allowedEntry) {
            console.log(`[USER INFO 404] Number not found.`);
            // Return 404 so the frontend knows the user is unverified/new
            return res.status(404).json({ message: 'Caller not found in AllowedNumber table.' });
        }

        console.log(`[USER INFO SUCCESS] UserID: ${allowedEntry.user_id}, MemberID: ${allowedEntry.member_id}`);
        
        // Return the extracted IDs
        res.status(200).json({
            message: 'User info fetched successfully.',
            userId: allowedEntry.user_id,
            memberId: allowedEntry.member_id || 'N/A' // Handle potential null member_id
        });

    } catch (e) {
        console.error("[USER INFO EXCEPTION]", e.message);
        res.status(500).json({ message: 'Server Error' });
    }
};

/**
 * Checks the subscription status of a phone number. (Used by the initial call webhook).
 */
exports.checkSubscriptionStatus = async (phoneNumber) => {
    const dbPhoneNumber = phoneNumber.replace(/[^0-9]/g, '');
    console.log(`[SUBSCRIPTION CHECK] Lookup for: ${phoneNumber} (DB: ${dbPhoneNumber})`);

    try {
        // STEP 1: Check AllowedNumber
        const { data: allowedNumbers, error: allowedError } = await supabase
            .from('AllowedNumber')
            // ⭐️ Included member_id here as well, although the function's main return doesn't use it.
            .select('user_id, member_id') 
            .eq('phone_number', dbPhoneNumber) 
            .limit(1);

        if (allowedError) {
            console.error("[QUERY 1/2 ERROR]", allowedError.message);
            return handleInactive(dbPhoneNumber, "DB Error");
        }

        const allowedEntry = allowedNumbers ? allowedNumbers[0] : null;

        if (!allowedEntry || !allowedEntry.user_id) {
            console.log(`[QUERY 1/2 FAILURE] Number not found.`);
            return handleInactive(dbPhoneNumber, "Unrecognized Caller");
        }

        const userId = allowedEntry.user_id;

        // STEP 2: Check User Table
        const { data: users, error: userError } = await supabase
            .from('User')
            .select('plan_status, name') 
            .eq('user_id', userId)
            .limit(1);

        if (userError) {
            console.error("[QUERY 2/2 ERROR]", userError.message);
            return handleInactive(dbPhoneNumber, "DB Error");
        }
        
        const user = users ? users[0] : null;

        if (!user) {
            return handleInactive(dbPhoneNumber, "User Data Missing");
        }

        if (user.plan_status && user.plan_status.toLowerCase() === 'active') {
            return {
                hasActiveSubscription: true,
                userName: user.name || "Active Subscriber",
                subscriptionStatus: "Verified",
                dashboardLink: `/user/dashboard/${userId}`,
                ticket: "Active Plan Call"
            };
        }

        return handleInactive(dbPhoneNumber, user.name || "Inactive Subscriber");
        
    } catch (e) {
        console.error("[LOOKUP EXCEPTION]", e.message);
        return handleInactive(dbPhoneNumber, "System Error");
    }
};

/**
 * Main handler for the incoming call webhook.
 */
exports.getIncomingCall = (ioInstanceGetter) => async (req, res) => {
    const currentAgentStatus = agentController.getRawStatus(); 
    console.log(`[CALL BLOCK CHECK] Agent Status: ${currentAgentStatus}`);
    
    if (currentAgentStatus === 'offline') {
        console.warn("[CALL BLOCKED] Agent OFFLINE.");
        return res.status(200).json({ 
            message: "Agent is offline.", 
            status: "Agent Offline" 
        });
    }

    console.log("[CALL PROCEED] Agent ONLINE.");
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
        console.log(`[SOCKET EMIT] Sending incoming-call...`);
        ioInstance.emit("incoming-call", callData);
    }
    
    res.status(200).json({
        message: "Call processed.",
        status: callData.subscriptionStatus,
        redirect: callData.dashboardLink
    });
};



/**
 * Creates a ticket in the logging DB.
 */
exports.createTicket = async (req, res) => {
    if (!logSupabase) {
        return res.status(500).json({ message: 'Ticket system offline.' });
    }

    // ⭐️ Added userId and memberId extraction from request body for ticket logging
    const { phoneNumber, requestDetails, userId, memberId } = req.body; 
    const activeAgentId = req.headers['x-agent-id'] || 'AGENT_001'; 

    if (!phoneNumber || !requestDetails) {
        return res.status(400).json({ message: 'Missing data.' });
    }

    try {
        const { data, error } = await logSupabase
            .from('tickets')
            .insert([{ 
                phone_number: phoneNumber,
                request_details: requestDetails,
                agent_id: activeAgentId, 
                status: 'New', 
                created_at: new Date().toISOString(),
                // ⭐️ NEW FIELDS ADDED TO TICKET
                user_id: userId,
                member_id: memberId,
            }])
            .select('id');

        if (error) {
            console.error('TICKET INSERT ERROR:', error.message);
            return res.status(500).json({ message: 'DB Error.', details: error.message });
        }

        console.log(`TICKET CREATED: ID ${data[0].id}`);
        res.status(201).json({ 
            message: 'Ticket created.', 
            ticket_id: data[0].id,
            requestDetails 
        });

    } catch (err) {
        console.error('TICKET EXCEPTION:', err.message);
        res.status(500).json({ message: 'Server Error.' });
    }
};



/**
 * Fetches all address_line entries for a given user_id.
 * * Logic flow: User ID -> (Address) -> Address ID & Address Line
 */
exports.getAddressByUserId = async (req, res) => {
    const { userId } = req.params; 

    if (!userId) return res.status(400).json({ message: 'Missing user ID.' });
    console.log(`[USER ADDRESS LOOKUP] ID: ${userId}`);

    try {
        const { data: addresses, error } = await supabase
            .from('Address')
            .select('address_id, user_id, address_line') 
            .eq('user_id', userId); 

        if (error) {
            console.error("[USER ADDRESS ERROR]", error.message);
            return res.status(500).json({ message: 'DB Error', details: error.message });
        }
        
        console.log(`[USER ADDRESS SUCCESS] Count: ${addresses ? addresses.length : 0}`);
        res.status(200).json({
            message: 'Addresses fetched.',
            addresses: addresses || [] 
        });

    } catch (e) {
        console.error("[USER ADDRESS EXCEPTION]", e.message);
        res.status(500).json({ message: 'Server Error' });
    }
};

/**
 * Fetches the specific address_line for a given address_id.
 */
exports.getAddressByAddressId = async (req, res) => {
    const { addressId } = req.params; 

    if (!addressId) {
        return res.status(400).json({ message: 'Missing address ID.' });
    }
    console.log(`[ADDRESS FETCH START] ID: ${addressId}`);

    try {
        const { data: address, error } = await supabase
            .from('Address')
            .select('address_line') 
            .eq('address_id', addressId) 
            .limit(1); 

        if (error) {
            console.error("[ADDRESS FETCH ERROR]", error.message);
            return res.status(500).json({ message: 'DB Error', details: error.message });
        }
        
        if (!address || address.length === 0) {
            console.warn(`[ADDRESS FETCH 404] ID ${addressId} not found.`);
            return res.status(404).json({ message: 'Address not found.' });
        }

        const addressLine = address[0].address_line;
        console.log(`[ADDRESS FETCH SUCCESS] Line: ${addressLine}`);

        res.status(200).json({
            message: 'Address fetched.',
            address_line: addressLine
        });

    } catch (e) {
        console.error("[ADDRESS FETCH EXCEPTION]", e.message);
        res.status(500).json({ message: 'Server Error' });
    }
};

// ----------------------------------------------------------------------
// EMPLOYEE DB FUNCTIONS
// ----------------------------------------------------------------------

/**
 * Fetches active servicemen who are interested in the specific service.
 * Query Logic: WHERE is_active = true AND category ILIKE '%service%'
 */
exports.getAvailableServicemen = async (req, res) => {
    console.group("🔍 [SERVICEMEN LOOKUP]");
    
    // 1. Initialization Check
    if (!empSupabase) {
        console.error("❌ [ERROR] Employee DB not configured (env vars missing).");
        console.groupEnd();
        return res.status(500).json({ message: 'Employee database unavailable.' });
    }

    const { service } = req.body; 
    console.log(`[INFO] Request Body received:`, req.body);
    console.log(`[INFO] Searching for service: '${service}'`);

    // 2. Validation
    if (!service) {
        console.error("⚠️ [ERROR] No service specified.");
        console.groupEnd();
        return res.status(400).json({ message: 'Service type is required.' });
    }

    try {
        // 3. Database Query
        // Table: 'services' 
        console.log(`[QUERY] Executing: SELECT * FROM services WHERE is_active=true AND category ILIKE '%${service}%'`);
        
        const { data, error } = await empSupabase
            .from('services') 
            .select('*') // Selecting all columns
            // Filter 1: Must be Active
            .eq('is_active', true)
            // Filter 2: Service match (Case-insensitive partial match)
            .ilike('category', `%${service}%`);

        if (error) {
            console.error("❌ [SUPABASE ERROR]", JSON.stringify(error, null, 2));
            console.groupEnd();
            return res.status(500).json({ message: 'Database query failed.', details: error.message });
        }

        // 4. Success Response
        const count = data ? data.length : 0;
        console.log(`✅ [SUCCESS] Found ${count} matching records.`);
        
        console.groupEnd();
        res.status(200).json(data || []);

    } catch (e) {
        console.error("🛑 [EXCEPTION]", e.message);
        console.groupEnd();
        res.status(500).json({ message: 'Internal server error.' });
    }
};

/**
 * Creates a new dispatch record in the Employee Supabase Dispatch table.
 * PRIMARY KEY LOGIC: order_id is the key identifier for the dispatch event.
 * @param {object} req.body - Contains order_id (MANDATORY), category, request_address, 
 * order_request, order_status, and phone_number. user_id is optional but recommended.
 */
exports.dispatchServiceman = async (req, res) => {
    console.group("📝 [DISPATCH NEW JOB]");

    // 1. Initialization Check
    if (!empSupabase) {
        console.error("❌ [ERROR] Employee DB not configured.");
        console.groupEnd();
        return res.status(500).json({ message: 'Employee database unavailable for dispatch.' });
    }

    // 2. Extract Data from Request Body
    const dispatchData = req.body;
    console.log("[INFO] Dispatch Data received:", dispatchData);

    // 3. Validation
    // --- CHANGE: user_id is replaced by order_id as the primary required field for the transaction. ---
    const requiredFields = ['order_id', 'category', 'request_address', 'order_status', 'order_request', 'phone_number'];
    const missingFields = requiredFields.filter(field => !dispatchData[field]);
    
    if (missingFields.length > 0) {
        console.error("⚠️ [ERROR] Missing required dispatch fields:", missingFields.join(', '));
        console.groupEnd();
        return res.status(400).json({ message: 'Missing required dispatch data.', missingFields });
    }

    try {
        // 4. Insert into 'Dispatch' table in the Employee DB
        // The table's primary key is likely 'id', but 'order_id' is the unique application key.
        const dataToInsert = {
            ...dispatchData,
            dispatched_at: new Date().toISOString(),
            order_status: dispatchData.order_status || 'Assigned' 
        };

        const { data, error } = await empSupabase
            .from('dispatch') // ⚠️ Ensure this table name is correct in your Employee DB
            .insert([dataToInsert])
            .select('*');

        if (error) {
            console.error("❌ [SUPABASE ERROR]", JSON.stringify(error, null, 2));
            console.groupEnd();
            return res.status(500).json({ message: 'Database dispatch insert failed.', details: error.message });
        }

        // 5. Success Response
        const newDispatchId = data[0]?.id || 'N/A';
        console.log(`✅ [SUCCESS] New Dispatch record created with ID: ${newDispatchId} (Order ID: ${dispatchData.order_id})`);
        
        console.groupEnd();
        res.status(201).json({
            message: 'Serviceman successfully dispatched.',
            dispatch_id: newDispatchId,
            order_id: dispatchData.order_id, // Explicitly return the new key
            details: data[0]
        });

    } catch (e) {
        console.error("🛑 [EXCEPTION]", e.message);
        console.groupEnd();
        res.status(500).json({ message: 'Internal server error during dispatch.' });
    }
};

