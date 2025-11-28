const { createClient } = require('@supabase/supabase-js');
const agentController = require('./agentController'); 

// ======================================================================
// 1. MAIN SUPABASE (User/Subscription Lookup & ORDER Table)
// ======================================================================
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY; 

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error("FATAL ERROR: Missing main Supabase credentials.");
    throw new Error("Missing main Supabase credentials in environment variables.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
// console.log("Main Supabase client initialized."); // Removed

// ======================================================================
// 2. LOGGING SUPABASE (Ticket Creation/Logs)
// ======================================================================
const LOG_SUPABASE_URL = process.env.LOG_SUPABASE_URL;
const LOG_SUPABASE_ANON_KEY = process.env.LOG_SUPABASE_ANON_KEY; 

let logSupabase = null;
if (LOG_SUPABASE_URL && LOG_SUPABASE_ANON_KEY) {
    try {
        logSupabase = createClient(LOG_SUPABASE_URL, LOG_SUPABASE_ANON_KEY);
        // console.log("Logging Supabase client initialized successfully."); // Removed
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
        // console.log("✅ Employee Supabase client initialized successfully."); // Removed
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
 * Checks the subscription status of a phone number.
 */
exports.checkSubscriptionStatus = async (phoneNumber) => {
    const dbPhoneNumber = phoneNumber.replace(/[^0-9]/g, '');
    // console.log(`[SUBSCRIPTION CHECK] Lookup for: ${phoneNumber} (DB: ${dbPhoneNumber})`); // Removed

    try {
        // STEP 1: Check AllowedNumber to get parent user_id
        const { data: allowedNumbers, error: allowedError } = await supabase
            .from('AllowedNumber')
            .select('user_id') 
            .eq('phone_number', dbPhoneNumber) 
            .limit(1);

        if (allowedError) {
            console.error("[SUBSCRIPTION LOOKUP ERROR]", allowedError.message);
            return handleInactive(dbPhoneNumber, "DB Error");
        }

        const allowedEntry = allowedNumbers ? allowedNumbers[0] : null;

        if (!allowedEntry || !allowedEntry.user_id) {
            // console.log(`[QUERY 1/2 FAILURE] Number not found.`); // Removed
            return handleInactive(dbPhoneNumber, "Unrecognized Caller");
        }
        // ... rest of the function remains the same
        const userId = allowedEntry.user_id;

        // STEP 2: Check User Table with parent user_id
        const { data: users, error: userError } = await supabase
            .from('User')
            .select('plan_status, name') 
            .eq('user_id', userId)
            .limit(1);

        if (userError) {
            console.error("[SUBSCRIPTION LOOKUP ERROR]", userError.message);
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
        console.error("[SUBSCRIPTION LOOKUP EXCEPTION]", e.message);
        return handleInactive(dbPhoneNumber, "System Error");
    }
};

/**
 * 🔑 NEW ENDPOINT FUNCTION: getMemberIdByPhoneNumber
 * Fetches the specific member_id from the Main Supabase 'AllowedNumber' table
 * based on phone_number.
 */
exports.getMemberIdByPhoneNumber = async (req, res) => {
    const { phoneNumber } = req.body;

    if (!phoneNumber) {
        console.error("🛑 [MEMBER ID LOOKUP FAIL] Missing phoneNumber in request body.");
        return res.status(400).json({ message: 'Phone number is required.' });
    }
    
    // Normalize phone number (remove non-digits, assuming your DB stores digits only)
    const dbPhoneNumber = phoneNumber.replace(/[^0-9]/g, '');
    
    // 1. EXTENSIVE LOGGING: Show exactly what is being searched
    console.log(`🔎 [MEMBER ID LOOKUP START]`);
    console.log(`-> Received Phone Number: "${phoneNumber}"`);
    console.log(`-> Normalized DB Key:     "${dbPhoneNumber}"`);
    console.log(`-> Type of DB Key:        ${typeof dbPhoneNumber}`);

    try {
        const { data, error } = await supabase
            .from('AllowedNumber')
            .select('member_id, phone_number') // Select phone_number too, for debugging
            .eq('phone_number', dbPhoneNumber)
            .limit(1);

        if (error) {
            console.error("❌ [MEMBER ID DB ERROR]", error.message);
            return res.status(500).json({ message: 'Database error during member ID lookup.', details: error.message });
        }
        
        // 2. EXTENSIVE LOGGING: Show the result of the query
        if (!data || data.length === 0) {
            console.warn(`⚠️ [MEMBER ID 404] No records found for normalized key: "${dbPhoneNumber}"`);
            
            // Helpful Hint: Check for data type mismatches
            if (data && data.length === 0) {
                 console.warn("    HINT: The phone number format or data type (e.g., string vs number) in the DB likely does not match the search key.");
            }
            
            return res.status(404).json({ message: 'Phone number not found.' });
        }

        // Access the member_id field
        const memberId = data[0].member_id; 
        console.log(`✅ [MEMBER ID SUCCESS] Found Member ID: ${memberId} (from DB phone: ${data[0].phone_number})`);
        
        res.status(200).json({ 
            message: 'Member ID fetched successfully.', 
            member_id: memberId 
        });

    } catch (e) {
        console.error("🛑 [MEMBER ID EXCEPTION]", e.message);
        res.status(500).json({ message: 'Internal server error.' });
    }
};

/**
 * Main handler for the incoming call webhook.
 */
exports.getIncomingCall = (ioInstanceGetter) => async (req, res) => {
    const currentAgentStatus = agentController.getRawStatus(); 
    // console.log(`[CALL BLOCK CHECK] Agent Status: ${currentAgentStatus}`); // Removed
    
    if (currentAgentStatus === 'offline') {
        console.warn("[CALL BLOCKED] Agent OFFLINE.");
        return res.status(200).json({ 
            message: "Agent is offline.", 
            status: "Agent Offline" 
        });
    }

    // console.log("[CALL PROCEED] Agent ONLINE."); // Removed
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

    const { phoneNumber, requestDetails } = req.body; 
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
 */
exports.getAddressByUserId = async (req, res) => {
    const { userId } = req.params; 

    if (!userId) return res.status(400).json({ message: 'Missing user ID.' });
    // console.log(`[USER ADDRESS LOOKUP] ID: ${userId}`); // Removed

    try {
        const { data: addresses, error } = await supabase
            .from('Address')
            .select('address_id, user_id, address_line') 
            .eq('user_id', userId); 

        if (error) {
            console.error("[USER ADDRESS ERROR]", error.message);
            return res.status(500).json({ message: 'DB Error', details: error.message });
        }
        
        // console.log(`[USER ADDRESS SUCCESS] Count: ${addresses ? addresses.length : 0}`); // Removed
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
    // console.log(`[ADDRESS FETCH START] ID: ${addressId}`); // Removed

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
            // console.warn(`[ADDRESS FETCH 404] ID ${addressId} not found.`); // Removed
            return res.status(404).json({ message: 'Address not found.' });
        }

        const addressLine = address[0].address_line;
        // console.log(`[ADDRESS FETCH SUCCESS] Line: ${addressLine}`); // Removed

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
    // ... logic remains the same, but logging is focused
    console.group("🔍 [SERVICEMEN LOOKUP]");
    if (!empSupabase) {
        console.error("❌ [ERROR] Employee DB not configured (env vars missing).");
        console.groupEnd();
        return res.status(500).json({ message: 'Employee database unavailable.' });
    }

    const { service } = req.body; 
    // console.log(`[INFO] Request Body received:`, req.body); // Removed verbose body log
    console.log(`[INFO] Searching for service: '${service}'`);

    if (!service) {
        console.error("⚠️ [ERROR] No service specified.");
        console.groupEnd();
        return res.status(400).json({ message: 'Service type is required.' });
    }

    try {
        // console.log(`[QUERY] Executing: SELECT * FROM services WHERE is_active=true AND category ILIKE '%${service}%'`); // Removed detailed query string
        
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

// ======================================================================
// Dispatch Serviceman + Create Order (Modified for Resilience)
// ======================================================================

/**
 * 1. Creates a dispatch record in Employee DB (Serviceman ID).
 * 2. Fetches Customer User ID & Member ID (if missing) in Main DB.
 * 3. Creates an Order record in Main DB (Customer ID).
 */
exports.dispatchServiceman = async (req, res) => {
    console.group("📝 [FULL DISPATCH PROCESS]");

    if (!empSupabase) {
        console.error("❌ [ERROR] Employee DB not configured.");
        console.groupEnd();
        return res.status(500).json({ message: 'Employee database unavailable.' });
    }

    const dispatchData = req.body;
    // user_id here is serviceman ID
    let { 
        order_id, category, user_id, 
        member_id, phone_number, request_address, 
        order_status, order_request, 
        address_id, // Destructure address_id here in case client sends it
        ticket_id // 🔑 ADDED: Ticket ID for the dispatch record
    } = dispatchData; 

    let customerUserId = null;
    let resolvedMemberId = member_id; // Start with the received member_id (or null/undefined)
    let resolvedAddressId = address_id; // Start with the received address_id

    // 1. Validation for essential, non-derivable data (Serviceman assignment data)
    if (!order_id || !user_id || !category || !ticket_id) {
        const missingFields = [];
        if (!order_id) missingFields.push('order_id');
        if (!user_id) missingFields.push('user_id (serviceman)');
        if (!category) missingFields.push('category');
        if (!ticket_id) missingFields.push('ticket_id'); // 🔑 ADDED: Validation for ticket_id
        
        console.error(`⚠️ [ERROR] Missing fields. Required: ${missingFields.join(', ')}`);
        console.error("-> Received dispatchData:", JSON.stringify(dispatchData, null, 2));
        
        console.groupEnd();
        return res.status(400).json({ 
            message: 'Missing essential dispatch data.',
            missing: missingFields,
            received: dispatchData 
        });
    }

    try {
        // ---------------------------------------------------------
        // STEP 2: Lookup Customer Identifiers (Member ID and User ID)
        // ---------------------------------------------------------
        
        // A. Resolve Member ID and get Customer User ID (Logic from previous fixes)
        if (!resolvedMemberId && phone_number) {
            console.log(`[STEP 2/A] Member ID missing. Attempting lookup via phone number: ${phone_number}...`);
            const dbPhoneNumber = phone_number.replace(/[^0-9]/g, '');

            const { data: allowedData, error: allowedError } = await supabase
                .from('AllowedNumber')
                .select('user_id, member_id')
                .eq('phone_number', dbPhoneNumber)
                .limit(1);

            if (allowedError || !allowedData || allowedData.length === 0) {
                console.error("❌ [MAIN DB LOOKUP ERROR] Could not find Customer IDs for this phone number.");
                console.groupEnd();
                return res.status(500).json({ 
                    message: 'Cannot proceed: Customer not found via phone number lookup.',
                    details: allowedError ? allowedError.message : 'No matching record found.'
                });
            }

            resolvedMemberId = allowedData[0].member_id;
            customerUserId = allowedData[0].user_id;

            console.log(`✅ [STEP 2/A SUCCESS] Resolved Member ID: ${resolvedMemberId}. Customer User ID: ${customerUserId}`);
        
        } else if (resolvedMemberId) {
            // B. If member_id IS present, use it to find the Customer User ID
            console.log(`[STEP 2/B] Member ID provided (${resolvedMemberId}). Looking up Customer User ID...`);
            
            const { data: allowedData, error: allowedError } = await supabase
                .from('AllowedNumber')
                .select('user_id')
                .eq('member_id', resolvedMemberId)
                .limit(1);
            
            if (allowedError || !allowedData || allowedData.length === 0) {
                console.error("❌ [MAIN DB LOOKUP ERROR] Could not find User ID for the provided Member ID.");
                console.groupEnd();
                return res.status(500).json({ 
                    message: 'Cannot proceed: Member ID lookup failed.',
                    details: allowedError ? allowedError.message : 'No matching record found.'
                });
            }

            customerUserId = allowedData[0].user_id;
            console.log(`✅ [STEP 2/B SUCCESS] Customer User ID found: ${customerUserId}`);

        } else {
            console.error("❌ [ERROR] Both member_id and phone_number are missing. Cannot proceed.");
            console.groupEnd();
            return res.status(400).json({ message: 'Missing required customer identifier (member_id or phone_number).' });
        }
        
        // ---------------------------------------------------------
        // STEP 2/C: Resolve Address ID (Fix for "address_id" not-null constraint)
        // We fetch the first available address ID for the customer if it's missing.
        // ---------------------------------------------------------
        if (!resolvedAddressId && customerUserId) {
            console.log(`[STEP 2/C] Address ID missing. Attempting to fetch a valid ID for Customer User ID: ${customerUserId}...`);
            
            const { data: addressData, error: addressError } = await supabase
                .from('Address')
                .select('address_id')
                .eq('user_id', customerUserId)
                .limit(1);

            if (addressError) {
                console.error("❌ [MAIN DB ADDRESS LOOKUP ERROR]", addressError.message);
                // Proceed with null, the DB will raise the expected error if it's non-nullable.
            }

            if (addressData && addressData.length > 0) {
                resolvedAddressId = addressData[0].address_id;
                console.log(`✅ [STEP 2/C SUCCESS] Found Address ID: ${resolvedAddressId} to satisfy the constraint.`);
            } else {
                console.warn("⚠️ [STEP 2/C WARNING] No address found for customer. The Order insertion will likely fail due to the non-null constraint.");
                // resolvedAddressId remains null, triggering the constraint error if the DB is empty.
            }
        }
        
        // ---------------------------------------------------------
        // STEP 1: Insert into Employee DB (Dispatch Table)
        // 'user_id' here is the SERVICEMAN
        // ---------------------------------------------------------
        console.log(`[STEP 1] Dispatching Serviceman (ID: ${user_id}) in Employee DB...`);
        
        const employeeDbData = {
            order_id, 
            user_id, // Serviceman
            category,
            request_address,
            order_status: order_status || 'Assigned',
            order_request,
            phone_number,
            ticket_id, // 🔑 ADDED: Insert the ticket ID into the dispatch record
            dispatched_at: new Date().toISOString()
        };

        const { data: empData, error: empError } = await empSupabase
            .from('dispatch') 
            .insert([employeeDbData])
            .select('*');

        if (empError) {
            console.error("❌ [EMPLOYEE DB ERROR]", empError.message);
            console.groupEnd();
            return res.status(500).json({ message: 'Failed to insert into Dispatch table.', details: empError.message });
        }
        console.log("✅ [STEP 1 SUCCESS] Dispatch record created.");


        // ---------------------------------------------------------
        // STEP 3: Insert into Main DB (Order Table)
        // 'user_id' here is the CUSTOMER
        // ---------------------------------------------------------
        console.log(`[STEP 3] Creating Order record in Main DB...`);

        const currentTimestamp = new Date().toISOString();

        // Placeholder for non-nullable fields not currently passed by the client.
        const mainDbOrderData = {
            order_id: order_id,
            user_id: customerUserId, 
            member_id: resolvedMemberId, 
            
            // FIX 1: Address ID
            address_id: resolvedAddressId, // Will be null if lookup failed, otherwise the found ID.
            
            // FIX 2: Service Subcategory (from previous issue)
            service_category: category,
            service_subcategory: category || 'General Service', 
            
            work_description: order_request, 
            

            order_status: 'Assigned',

            // NEW FIELDS ADDED:
            scheduled_date: currentTimestamp, // Placeholder timestamp
            preferred_time: '9:00 AM - 1:00 PM', // Placeholder text
            created_at: currentTimestamp, // Current timestamp (created_at)
            updated_at: currentTimestamp, // Current timestamp (updated_at)
        };

        const { data: orderData, error: orderError } = await supabase
            .from('Order') 
            .insert([mainDbOrderData])
            .select('*');

        if (orderError) {
            console.error("❌ [MAIN DB ORDER ERROR]", orderError.message);
            console.groupEnd();
            return res.status(500).json({ 
                message: 'Serviceman dispatched, but failed to create Order record.', 
                details: orderError.message 
            });
        }
        console.log("✅ [STEP 3 SUCCESS] Order record created.");

        // ---------------------------------------------------------
        // FINAL SUCCESS
        // ---------------------------------------------------------
        console.groupEnd();
        res.status(201).json({
            message: 'Serviceman dispatched and Order created successfully.',
            dispatch_id: empData[0]?.id,
            order_id: order_id
        });

    } catch (e) {
        console.error("🛑 [EXCEPTION]", e.message);
        console.groupEnd();
        res.status(500).json({ message: 'Internal server error during full dispatch process.' });
    }
};
