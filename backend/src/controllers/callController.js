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
 * 🚀 Fetches the userId and member_id from the AllowedNumber table based on phone number.
 * **(LOGGING ADDED HERE)**
 */
exports.getUserInfoByPhoneNumber = async (req, res) => {
    const { phoneNumber } = req.params;
    const dbPhoneNumber = phoneNumber ? phoneNumber.replace(/[^0-9]/g, '') : null;
    
    // 🛠️ NEW LOGGING: Verify input and cleaned phone number
    console.log(`[USER INFO LOOKUP - START] Original Phone: ${phoneNumber}`);
    console.log(`[USER INFO LOOKUP - CLEANED] DB Phone: ${dbPhoneNumber}`);

    if (!dbPhoneNumber) {
        return res.status(400).json({ message: 'Missing phone number.' });
    }

    try {
        // 🛠️ NEW LOGGING: Log the exact query filter
        console.log(`[DB QUERY] Table: AllowedNumber, Filter: phone_number = '${dbPhoneNumber}'`);

        const { data: allowedNumbers, error: allowedError } = await supabase
            .from('AllowedNumber')
            .select('user_id, member_id') 
            .eq('phone_number', dbPhoneNumber) 
            .limit(1);

        if (allowedError) {
            // 🛠️ NEW LOGGING: Log Supabase error details
            console.error("[USER INFO ERROR] Supabase Query Failed:", allowedError.message, allowedError.details);
            return res.status(500).json({ message: 'DB Error', details: allowedError.message });
        }
        
        // 🛠️ NEW LOGGING: Log the raw data returned
        console.log(`[DB RESULT] Raw Data Count: ${allowedNumbers ? allowedNumbers.length : 0}`);

        const allowedEntry = allowedNumbers ? allowedNumbers[0] : null;

        if (!allowedEntry) {
            console.log(`[USER INFO 404] Number not found in AllowedNumber.`);
            // This 404 is the likely cause of your frontend issue.
            return res.status(404).json({ message: 'Caller not found in AllowedNumber table.' });
        }
        
        // 🛠️ NEW LOGGING: Log the IDs *before* sending to frontend
        console.log(`[USER INFO SUCCESS] Fetched UserID: ${allowedEntry.user_id}, Fetched MemberID: ${allowedEntry.member_id}`);
        
        // Return the extracted IDs
        res.status(200).json({
            message: 'User info fetched successfully.',
            userId: allowedEntry.user_id,
            memberId: allowedEntry.member_id || 'N/A' // Handle potential null member_id
        });
        
        console.log("[USER INFO LOOKUP - END] Response Sent.");

    } catch (e) {
        console.error("[USER INFO EXCEPTION] Server Exception:", e.message);
        res.status(500).json({ message: 'Server Error' });
    }
};

/**
 * Checks the subscription status of a phone number. (Used by the initial call webhook).
 * **(LOGGING ADDED HERE)**
 */
exports.checkSubscriptionStatus = async (phoneNumber) => {
    const dbPhoneNumber = phoneNumber.replace(/[^0-9]/g, '');
    
    // 🛠️ NEW LOGGING: Verify input and cleaned phone number
    console.log(`[SUBSCRIPTION CHECK - START] Original Phone: ${phoneNumber} (DB: ${dbPhoneNumber})`);

    try {
        // STEP 1: Check AllowedNumber
        // 🛠️ NEW LOGGING: Log the exact query filter
        console.log(`[DB QUERY 1/2] Table: AllowedNumber, Filter: phone_number = '${dbPhoneNumber}'`);
        
        const { data: allowedNumbers, error: allowedError } = await supabase
            .from('AllowedNumber')
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
        // 🛠️ NEW LOGGING: Log the fetched user ID
        console.log(`[QUERY 1/2 SUCCESS] Fetched UserID: ${userId}`);


        // STEP 2: Check User Table
        // 🛠️ NEW LOGGING: Log the exact query filter
        console.log(`[DB QUERY 2/2] Table: User, Filter: user_id = '${userId}'`);
        
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
            console.log(`[QUERY 2/2 FAILURE] User data missing for ID: ${userId}`);
            return handleInactive(dbPhoneNumber, "User Data Missing");
        }
        
        // 🛠️ NEW LOGGING: Log the status found
        console.log(`[SUBSCRIPTION CHECK - END] Status: ${user.plan_status}, Name: ${user.name}`);

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
    
    // 🛠️ NEW LOGGING: Log the incoming number before processing
    console.log(`[INCOMING CALL] Processing number: ${incomingNumber}`);
    
    const userData = await exports.checkSubscriptionStatus(incomingNumber);
    
    const callData = {
        caller: incomingNumber,
        name: userData.userName,
        subscriptionStatus: userData.subscriptionStatus,
        dashboardLink: userData.dashboardLink,
        ticket: userData.ticket,
        isExistingUser: userData.hasActiveSubscription
    };
    
    // 🛠️ NEW LOGGING: Log the final call data payload
    console.log(`[INCOMING CALL] Payload to Frontend:`, callData);
    
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
 * **(LOGGING ADDED HERE)**
 */
exports.createTicket = async (req, res) => {
    if (!logSupabase) {
        return res.status(500).json({ message: 'Ticket system offline.' });
    }

    const { phoneNumber, requestDetails, userId, memberId } = req.body; 
    const activeAgentId = req.headers['x-agent-id'] || 'AGENT_001'; 

    if (!phoneNumber || !requestDetails) {
        return res.status(400).json({ message: 'Missing data.' });
    }

    try {
        // 🛠️ NEW LOGGING: Log data being prepared for insertion
        console.log(`[TICKET CREATION] Inserting Data: UserID=${userId}, MemberID=${memberId}, Phone=${phoneNumber}`);

        const { data, error } = await logSupabase
            .from('tickets')
            .insert([{ 
                phone_number: phoneNumber,
                request_details: requestDetails,
                agent_id: activeAgentId, 
                status: 'New', 
                created_at: new Date().toISOString(),
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
 * **(LOGGING ADDED HERE)**
 */
exports.getAddressByUserId = async (req, res) => {
    const { userId } = req.params; 

    if (!userId) return res.status(400).json({ message: 'Missing user ID.' });
    
    // 🛠️ NEW LOGGING: Verify the userId received from the frontend
    console.log(`[USER ADDRESS LOOKUP - START] Received ID: ${userId}`);

    try {
        // 🛠️ NEW LOGGING: Log the exact query filter
        console.log(`[DB QUERY] Table: Address, Filter: user_id = '${userId}'`);

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
        
        console.log("[USER ADDRESS LOOKUP - END] Response Sent.");

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
        console.log(`[QUERY] Executing: SELECT * FROM services WHERE is_active=true AND category ILIKE '%${service}%'`);
        
        const { data, error } = await empSupabase
            .from('services') 
            .select('*')
            .eq('is_active', true)
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
    const requiredFields = ['order_id', 'category', 'request_address', 'order_status', 'order_request', 'phone_number'];
    const missingFields = requiredFields.filter(field => !dispatchData[field]);
    
    if (missingFields.length > 0) {
        console.error("⚠️ [ERROR] Missing required dispatch fields:", missingFields.join(', '));
        console.groupEnd();
        return res.status(400).json({ message: 'Missing required dispatch data.', missingFields });
    }

    try {
        // 4. Insert into 'Dispatch' table in the Employee DB
        const dataToInsert = {
            ...dispatchData,
            dispatched_at: new Date().toISOString(),
            order_status: dispatchData.order_status || 'Assigned' 
        };
        
        // 🛠️ NEW LOGGING: Log the data being inserted
        console.log(`[DB INSERT] Inserting: Order ID ${dispatchData.order_id}`);

        const { data, error } = await empSupabase
            .from('dispatch') 
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
            order_id: dispatchData.order_id, 
            details: data[0]
        });

    } catch (e) {
        console.error("🛑 [EXCEPTION]", e.message);
        console.groupEnd();
        res.status(500).json({ message: 'Internal server error during dispatch.' });
    }
};
