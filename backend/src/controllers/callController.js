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

// ======================================================================
// 2. LOGGING SUPABASE (Ticket Creation/Logs)
// ======================================================================
const LOG_SUPABASE_URL = process.env.LOG_SUPABASE_URL;
const LOG_SUPABASE_ANON_KEY = process.env.LOG_SUPABASE_ANON_KEY; 

let logSupabase = null;
if (LOG_SUPABASE_URL && LOG_SUPABASE_ANON_KEY) {
    try {
        logSupabase = createClient(LOG_SUPABASE_URL, LOG_SUPABASE_ANON_KEY);
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

/**
 * Fetches the customer name based on member_id or falls back to user_id.
 * @param {string} customerUserId - The user_id associated with the customer.
 * @param {string | null} resolvedMemberId - The member_id, which may be null.
 * @returns {Promise<string>} The customer's name or 'Unknown Customer'.
 */
const fetchCustomerName = async (customerUserId, resolvedMemberId) => {
    if (!customerUserId) {
        console.log("⚠️ [NAME LOOKUP] No customerUserId provided.");
        return 'Unknown Customer';
    }

    try {
        let customerName = null;

        // Case #1: member_id is NOT NULL - Fetch from Member table
        if (resolvedMemberId) {
            console.log(`🔎 [NAME LOOKUP] Trying Member table for member_id: ${resolvedMemberId}`);
            const { data: memberData, error: memberError } = await supabase
                .from('Member')
                .select('name') // Assuming the Member table has a 'name' column
                .eq('member_id', resolvedMemberId)
                .limit(1);

            if (memberError) {
                console.error(`❌ [NAME LOOKUP] Member DB Error: ${memberError.message}`);
                // Continue to User lookup on DB error
            } else if (memberData && memberData.length > 0) {
                // Member record was found
                customerName = memberData[0].name; // Can be null/undefined/""

                if (customerName) {
                    console.log(`✅ [NAME LOOKUP] Found name in Member table: ${customerName}`);
                    return customerName;
                } else {
                    console.warn(`⚠️ [NAME LOOKUP] Member record found for ID ${resolvedMemberId}, but name column is NULL/EMPTY. Falling back to User table.`);
                }
            } else {
                console.warn(`⚠️ [NAME LOOKUP] No Member record found for ID: ${resolvedMemberId}. Falling back to User table.`);
            }
        }

        // Case #2: member_id is NULL or Member lookup failed/returned no name - Fetch from User table
        console.log(`🔎 [NAME LOOKUP] Falling back to User table for user_id: ${customerUserId}`);
        const { data: userData, error: userError } = await supabase
            .from('User')
            .select('name') // Assuming the User table has a 'name' column
            .eq('user_id', customerUserId)
            .limit(1);

        if (userError) {
            console.error(`❌ [NAME LOOKUP] User DB Error: ${userError.message}`);
            return 'Unknown Customer (DB Error)';
        }

        if (userData && userData.length > 0 && userData[0].name) {
            customerName = userData[0].name;
            console.log(`✅ [NAME LOOKUP] Found name in User table: ${customerName}`);
            return customerName;
        }

        console.warn("⚠️ [NAME LOOKUP] Name not found in Member or User table.");
        return 'Unknown Customer';

    } catch (e) {
        console.error("🛑 [NAME LOOKUP EXCEPTION]", e.message);
        return 'Unknown Customer';
    }
};

// ----------------------------------------------------------------------
// CONTROLLER FUNCTIONS
// ----------------------------------------------------------------------

/**
 * 🚀 PRIORITY 1: Check if the caller is an internal EMPLOYEE.
 * Checks 'users' table in Employee DB using 'mobile_number'.
 */
const checkIfCallerIsEmployee = async (phoneNumber) => {
    if (!empSupabase) {
        console.warn("⚠️ Employee DB not connected. Skipping check.");
        console.groupEnd();
        return null;
    }

    // FIX: 1. Trim whitespace (removes leading/trailing spaces, including invisible ones).
    const trimmedPhoneNumber = phoneNumber.trim();
    
    // FIX: 2. Normalize: Remove all characters EXCEPT digits (\d) and the plus sign (+).
    // This is the correct logic for a DB that stores the leading '+'.
    const dbPhoneNumber = trimmedPhoneNumber.replace(/[^\d+]/g, ''); 
    
    console.log(`> Raw Input:       "${phoneNumber}"`);
    console.log(`> Database Key (Normalized):  "${dbPhoneNumber}"`);

    try {
        // 2. Perform Query
        console.log(`> Querying 'users' table where mobile_number = '${dbPhoneNumber}'...`);
        
        const { data, error } = await empSupabase
            .from('users') 
            .select('*')
            .eq('mobile_number', dbPhoneNumber) // Comparing the cleaned string "+91987651111"
            .limit(1);

        // 3. Log Results
        if (error) {
            console.error(`❌ DB Query Error: ${error.message}`);
            console.groupEnd();
            return null;
        }

        console.log(`> Result Rows Found: ${data ? data.length : 0}`);

        if (data && data.length > 0) {
            const employee = data[0];
            console.log(`✅ MATCH FOUND!`);
            console.log(`    - Name: ${employee.name}`);
            console.log(`    - Role: ${employee.role}`);
            console.log(`    - ID:    ${employee.id}`);
            console.groupEnd();
            
            return {
                isEmployee: true,
                userName: `${employee.name} (Employee)`,
                subscriptionStatus: "Internal Staff",
                dashboardLink: "/employeehelpdesk", // Redirects here
                ticket: `Internal Call - ${employee.role || 'Staff'}`,
                employeeData: employee
            };
        } else {
            console.log("❌ No match in 'users' table.");
            console.groupEnd();
            return null; 
        }

    } catch (e) {
        console.error(`🛑 Exception in Employee Check: ${e.message}`);
        console.groupEnd();
        return null;
    }
};


/**
 * 🚀 PRIORITY 3: Standard Subscription Status Check (Regular Customer).
 */
exports.checkSubscriptionStatus = async (phoneNumber) => {
    const dbPhoneNumber = phoneNumber.replace(/[^0-9]/g, '');

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
            return handleInactive(dbPhoneNumber, "Unrecognized Caller");
        }
        
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
                dashboardLink: `/user/dashboard/${userId}?phoneNumber=${dbPhoneNumber}`,
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
 * 🔥 NEW API ENDPOINT: Fetches the parent user_id from the Main Supabase 'AllowedNumber' table
 * based on the provided phone_number query parameter.
 * URL: /user/lookup?phoneNumber=...
 */
exports.getUserIdByPhoneNumber = async (req, res) => {
    console.group("🔎 [USER ID LOOKUP START]");
    const { phoneNumber } = req.query; // Expects a query parameter: ?phoneNumber=...
    
    if (!phoneNumber) {
        console.error("🛑 [USER ID LOOKUP FAIL] Missing phoneNumber in query parameters.");
        console.groupEnd();
        return res.status(400).json({ message: 'Phone number is required.' });
    }
    
    // Normalize phone number (removes all non-digits, matching your checkSubscriptionStatus logic)
    const dbPhoneNumber = String(phoneNumber).replace(/[^0-9]/g, '');
    
    console.log(`[QUERY] Searching 'AllowedNumber' for: "${dbPhoneNumber}"`);
    
    try {
        // Step 1: Check AllowedNumber to get parent user_id
        const { data: allowedNumbers, error: allowedError } = await supabase
            .from('AllowedNumber')
            .select('user_id')
            .eq('phone_number', dbPhoneNumber)
            .limit(1);

        if (allowedError) {
            console.error("❌ [USER ID DB ERROR]", allowedError.message);
            console.groupEnd();
            return res.status(500).json({ 
                message: 'Database error during user ID lookup.', 
                details: allowedError.message 
            });
        }
        
        const userId = allowedNumbers && allowedNumbers.length > 0 ? allowedNumbers[0].user_id : null;

        if (!userId) {
            console.warn(`⚠️ [USER ID 404] No user_id found for phone: ${dbPhoneNumber}.`);
            console.groupEnd();
            // Return 404, which is what the frontend currently expects upon failure
            return res.status(404).json({ 
                message: 'User ID not found for this phone number.' 
            });
        }
        
        console.log(`✅ [USER ID SUCCESS] Found User ID: ${userId}`);
        console.groupEnd();

        // Return the user_id in the expected format for the frontend
        res.status(200).json({ 
            success: true,
            userId: userId, // <-- This must match the frontend state variable name (userId)
        });
        
    } catch (e) {
        console.error("🛑 [USER ID LOOKUP EXCEPTION]", e.message);
        console.groupEnd();
        res.status(500).json({ 
            message: 'Internal server error.',
            error: e.message 
        });
    }
};
// Assuming this is in a file like 'callController.js' and 'empSupabase' is imported/defined elsewhere.

// ⚡ NEW EMPLOYEE API ENDPOINTS FOR FRONTEND (EmployeeHelpDeskPage.jsx)
// ----------------------------------------------------------------------

/**
 * Endpoint 1: Fetches Employee Details (specifically the UID, which maps to user_id in dispatch).
 * This resolves the phone number to the unique employee ID.
 * URL: /call/employee/details?mobile_number=...
 */
exports.getEmployeeDetailsByMobile = async (req, res) => {
    console.log("📞 API: EMPLOYEE DETAILS LOOKUP ATTEMPT (Pre-catch)");
    
    try {
        console.group("📞 API: EMPLOYEE DETAILS LOOKUP START");

        // Setup checks... (Kept for safety)
        if (typeof empSupabase === 'undefined' || !empSupabase) {
            console.error("❌ [API: EMP DETAILS] Supabase client is not defined/configured.");
            console.groupEnd();
            return res.status(503).json({ message: 'Employee DB not configured.' });
        }

        const { mobile_number } = req.query;

        if (!mobile_number) {
            console.error("❌ [API: EMP DETAILS] Missing 'mobile_number' in query parameters.");
            console.groupEnd();
            return res.status(400).json({ message: 'Missing mobile_number query parameter.' });
        }

        // Mobile Number Formatting (Kept fixed)
        let dbPhoneNumber = String(mobile_number).trim().replace(/[^\d+]/g, ''); 
        if (!dbPhoneNumber.startsWith('+')) {
            dbPhoneNumber = '+' + dbPhoneNumber;
        }

        console.log(`🔎 [API: EMP DETAILS] Raw Input: "${mobile_number}". Database Key: "${dbPhoneNumber}"`);

        console.log(`📡 [API: EMP DETAILS] Querying 'users' table for mobile_number = '${dbPhoneNumber}'...`);
        
        // 🚀 FIX 1: Select only the existing columns: 'uid' and 'mobile_number'
        const { data, error } = await empSupabase
            .from('users')
            .select('uid, mobile_number') // <-- ONLY SELECT COLUMNS THAT EXIST
            .eq('mobile_number', dbPhoneNumber)
            .limit(1);

        if (error) {
            console.error("❌ [API: EMP DETAILS] DB Query Error:", JSON.stringify(error, null, 2));
            console.groupEnd();
            return res.status(500).json({ message: 'Database query error.', details: error.message });
        }

        if (!data || data.length === 0) {
            console.warn(`⚠️ [API: EMP DETAILS] Employee not found. Result count: ${data ? data.length : 0}.`);
            console.groupEnd();
            return res.status(404).json({ message: 'Employee not found for this number.' });
        }
        
        const employee = data[0];
        // 🚀 FIX 2: Correct log and response to use the 'uid' value
        console.log(`✅ [API: EMP DETAILS] Match Found! UID (Used as User ID): ${employee.uid}`);
        
        // Return the UID mapped to the expected user_id for the next endpoint call.
        res.status(200).json({
            success: true,
            user_id: employee.uid, // <-- MAPPING: uid from 'users' becomes user_id for frontend/dispatch
            employee_name: null,    // <-- Set to null since 'name' is not fetched
            mobile_number: employee.mobile_number,
        });
        console.groupEnd();

    } catch (e) {
        console.error("🛑 [API: EMP DETAILS EXCEPTION] Unhandled Exception:", e.message, e.stack);
        try { console.groupEnd(); } catch(err) {} 
        res.status(500).json({ 
            message: 'Internal server error.',
            details: e.message
        });
    }
};
// ----------------------------------------------------------------------
// ----------------------------------------------------------------------

/**
 * Endpoint 2: Fetches the active dispatch details using the employee's user_id.
 * This is the second step after resolving the employee's ID.
 * URL: /api/dispatch/active-order?user_id=...
 */
exports.getActiveDispatchByUserId = async (req, res) => {
    console.log("📞 API: ACTIVE DISPATCH LOOKUP ATTEMPT (Pre-catch)");
    
    try {
        console.group("📞 API: ACTIVE DISPATCH LOOKUP START");
        const { user_id } = req.query; // This user_id parameter comes from the uid returned by Endpoint 1

        // Setup checks... (Kept for safety)
        if (typeof empSupabase === 'undefined' || !empSupabase) {
            console.error("❌ [API: DISPATCH DETAILS] Employee DB is not configured.");
            console.groupEnd();
            return res.status(503).json({ message: 'Employee DB not configured.' });
        }
        
        if (!user_id) {
            console.error("❌ [API: DISPATCH DETAILS] Missing 'user_id' in query parameters.");
            console.groupEnd();
            return res.status(400).json({ message: 'Missing user_id query parameter.' });
        }

        console.log(`🔎 [API: DISPATCH DETAILS] Target Employee user_id (from uid): ${user_id}`);
        
        // Status required for active dispatch (Assigned)
        const requiredStatus = 'Assigned';

        console.log(`📡 [API: DISPATCH DETAILS] Querying 'dispatch' table for user_id = '${user_id}'. Required status: '${requiredStatus}'`);

        // Find the most recent, Assigned order
        const { data, error } = await empSupabase
            .from('dispatch')
            .select('*') // Select all columns from dispatch table
            // 🚀 FIX: Use the 'user_id' from the URL parameter to match the 'user_id' column
            .eq('user_id', user_id) 
            .eq('order_status', requiredStatus) 
            .order('dispatched_at', { ascending: false }) 
            .limit(1);

        if (error) {
            console.error("❌ [API: DISPATCH DETAILS] DB Query Error:", JSON.stringify(error, null, 2));
            console.groupEnd();
            return res.status(500).json({ message: 'Database query error.', details: error.message });
        }

        if (!data || data.length === 0) {
            console.log("ℹ️ [API: DISPATCH DETAILS] No matching dispatch record found (or zero rows returned).");
            console.groupEnd();
            return res.status(200).json({ 
                message: 'No active dispatch found for this employee.',
                dispatchData: {} 
            });
        }

        const dispatchRecord = data[0];
        console.log(`✅ [API: DISPATCH DETAILS] Found active Order ID: ${dispatchRecord.order_id}, Status: ${dispatchRecord.order_status}`);
        
        // Return the full dispatch record
        res.status(200).json({
            success: true,
            dispatchData: dispatchRecord
        });
        console.groupEnd();

    } catch (e) {
        console.error("🛑 [API: DISPATCH DETAILS EXCEPTION] Unhandled Exception:", e.message, e.stack);
        try { console.groupEnd(); } catch(err) {} 
        res.status(500).json({ message: 'Internal server error.' });
    }
};

/**
 * Endpoint 3: Cancels an active dispatch order.
 * Updates status to 'Cancelled' and appends the reason to notes.
 * URL: /call/dispatch/cancel
 * Method: PUT
 */
exports.cancelActiveDispatch = async (req, res) => {
    console.log("📞 API: CANCEL DISPATCH ATTEMPT");

    try {
        const { order_id, cancellation_reason } = req.body;

        if (typeof empSupabase === 'undefined' || !empSupabase) {
            return res.status(503).json({ message: 'Employee DB not configured.' });
        }

        if (!order_id || !cancellation_reason) {
            return res.status(400).json({ message: 'Missing order_id or cancellation_reason.' });
        }

        console.log(`To Cancel: Order #${order_id}. Reason: ${cancellation_reason}`);

        // 1. First, fetch existing notes to append to them (optional, but good practice)
        const { data: currentData, error: fetchError } = await empSupabase
            .from('dispatch')
            .select('order_request')
            .eq('order_id', order_id)
            .single();

        if (fetchError) {
            throw new Error(`Failed to fetch current order data: ${fetchError.message}`);
        }

        const oldNotes = currentData.order_request || '';
        const timestamp = new Date().toLocaleString();
        const newNotes = `${oldNotes}\n\n[CANCELLED by Agent at ${timestamp}]: ${cancellation_reason}`;

        // 2. Update the record
        const { data, error } = await empSupabase
            .from('dispatch')
            .update({ 
                order_status: 'Cancelled',
                order_request: newNotes
            })
            .eq('order_id', order_id)
            .select();

        if (error) {
            console.error("❌ DB Update Error:", error);
            return res.status(500).json({ message: 'Failed to update order status.', details: error.message });
        }

        console.log(`✅ Order #${order_id} marked as Cancelled.`);
        
        res.status(200).json({ 
            success: true, 
            message: 'Order cancelled successfully',
            data: data[0]
        });

    } catch (e) {
        console.error("🛑 Exception in Cancel:", e.message);
        res.status(500).json({ message: 'Internal server error.', details: e.message });
    }
};
/**
 * 🔥 UPDATED: Fetches member_id AND customer_name from the Main Supabase 'AllowedNumber' table
 * based on phone_number.
 * URL: POST /call/memberid/lookup
 * Body: { phoneNumber: "..." }
 */
exports.getMemberIdByPhoneNumber = async (req, res) => {
    const { phoneNumber } = req.body;
    
    if (!phoneNumber) {
        console.error("🛑 [MEMBER ID LOOKUP FAIL] Missing phoneNumber in request body.");
        return res.status(400).json({ message: 'Phone number is required.' });
    }
    
    const dbPhoneNumber = String(phoneNumber).replace(/[^0-9]/g, '');
    
    console.log(`🔎 [MEMBER ID & NAME LOOKUP START] Searching for: "${dbPhoneNumber}"`);
    
    try {
        // STEP 1: Get member_id and user_id from AllowedNumber table
        const { data, error } = await supabase
            .from('AllowedNumber')
            .select('member_id, user_id, phone_number')
            .eq('phone_number', dbPhoneNumber)
            .limit(1);
            
        if (error) {
            console.error("❌ [MEMBER ID DB ERROR]", error.message);
            return res.status(500).json({ 
                message: 'Database error during member ID lookup.', 
                details: error.message 
            });
        }
        
        if (!data || data.length === 0) {
            console.warn(`⚠️ [MEMBER ID 404] No records found.`);
            return res.status(404).json({ 
                message: 'Phone number not found.' 
            });
        }
        
        const memberId = data[0].member_id;
        const userId = data[0].user_id;
        
        console.log(`✅ [MEMBER ID SUCCESS] Found Member ID: ${memberId}, User ID: ${userId}`);
        
        // STEP 2: Fetch customer name using the helper function
        let customerName = 'Unknown Customer';
        
        if (userId) {
            try {
                customerName = await fetchCustomerName(userId, memberId);
                console.log(`✅ [CUSTOMER NAME FETCHED] Name: ${customerName}`);
            } catch (nameError) {
                console.error("⚠️ [CUSTOMER NAME ERROR]", nameError);
                customerName = 'Unknown Customer';
            }
        }
        
        // STEP 3: Return both member_id and customer_name
        res.status(200).json({ 
            message: 'Member ID and name fetched successfully.', 
            member_id: memberId,
            customer_name: customerName // ⭐ NOW INCLUDED
        });
        
    } catch (e) {
        console.error("🛑 [MEMBER ID EXCEPTION]", e.message);
        res.status(500).json({ 
            message: 'Internal server error.',
            error: e.message 
        });
    }
};
/**
 * Main handler for the incoming call webhook.
 * LOGIC FLOW: 
 * 1. Check if Employee (users table)
 * 2. Check if Dispatch Customer (dispatch table)
 * 3. Check if Regular Subscriber (AllowedNumber table)
 */
exports.getIncomingCall = (ioInstanceGetter) => async (req, res) => {
    const currentAgentStatus = agentController.getRawStatus(); 
    
    if (currentAgentStatus === 'offline') {
        console.warn("[CALL BLOCKED] Agent OFFLINE.");
        return res.status(200).json({ 
            message: "Agent is offline.", 
            status: "Agent Offline" 
        });
    }

    const incomingNumber = req.body.From || req.query.From || req.body.caller || "+911234567890"; 
    console.log(`📞 [INCOMING CALL] Processing number: ${incomingNumber}`);

    let callData = {};

    // 🚀 STEP 1: Check if Caller is an EMPLOYEE (Table: users)
    const employeeResult = await checkIfCallerIsEmployee(incomingNumber);

    if (employeeResult && employeeResult.isEmployee) {
        console.log("⚡ [ROUTING] Caller is an INTERNAL EMPLOYEE.");
        
        callData = {
            caller: incomingNumber,
            name: employeeResult.userName,
            subscriptionStatus: "Internal Staff",
            dashboardLink: employeeResult.dashboardLink, // /employee-help-desk
            ticket: employeeResult.ticket,
            isExistingUser: true,
            isEmployeeCall: true,
            dispatchData: null // Or pass employee specific data here if needed
        };

    } else {
       // 🚀 STEP 3: If NOT Dispatch, proceed with Standard User Subscription Check
            console.log("ℹ️ [ROUTING] No Dispatch/Employee record. Checking User Subscription.");
            const userData = await exports.checkSubscriptionStatus(incomingNumber);
            
            callData = {
                caller: incomingNumber,
                name: userData.userName,
                subscriptionStatus: userData.subscriptionStatus,
                dashboardLink: userData.dashboardLink, // /user/dashboard or /new-call/search
                ticket: userData.ticket,
                isExistingUser: userData.hasActiveSubscription,
                isEmployeeCall: false
            };
        } 
        
    
    
    // Emit to Frontend
    const ioInstance = ioInstanceGetter();
    if (ioInstance) {
        console.log(`[SOCKET EMIT] Sending incoming-call to Frontend...`);
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

    try {
        const { data: addresses, error } = await supabase
            .from('Address')
            .select('address_id, user_id, address_line') 
            .eq('user_id', userId); 

        if (error) {
            console.error("[USER ADDRESS ERROR]", error.message);
            return res.status(500).json({ message: 'DB Error', details: error.message });
        }
        
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
            return res.status(404).json({ message: 'Address not found.' });
        }

        res.status(200).json({
            message: 'Address fetched.',
            address_line: address[0].address_line
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
    if (!empSupabase) {
        console.error("❌ [ERROR] Employee DB not configured (env vars missing).");
        console.groupEnd();
        return res.status(500).json({ message: 'Employee database unavailable.' });
    }

    const { service } = req.body; 
    console.log(`[INFO] Searching for service: '${service}'`);

    if (!service) {
        console.error("⚠️ [ERROR] No service specified.");
        console.groupEnd();
        return res.status(400).json({ message: 'Service type is required.' });
    }

    try {
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
/**
 * 🔥 NEW: Fetches dispatch details by Order ID.
 * Used for re-dispatching cancelled orders.
 */
exports.getDispatchDetails = async (req, res) => {
    console.group("🔍 [DISPATCH DETAILS LOOKUP]");
    const { order_id } = req.params;

    if (!order_id) {
        console.error("⚠️ [ERROR] No order_id specified.");
        console.groupEnd();
        return res.status(400).json({ message: 'Order ID is required.' });
    }

    if (!empSupabase) {
        return res.status(500).json({ message: 'Employee database unavailable.' });
    }

    try {
        const { data, error } = await empSupabase
            .from('dispatch')
            .select('ticket_id, phone_number, admin_id, request_address, category, order_request')
            .eq('order_id', order_id)
            .single();

        if (error) {
            console.error("❌ [DB ERROR]", error.message);
            console.groupEnd();
            return res.status(404).json({ message: 'Order details not found.' });
        }

        console.log(`✅ [SUCCESS] Retrieved details for Order: ${order_id}`);
        console.groupEnd();
        res.status(200).json(data);

    } catch (e) {
        console.error("🛑 [EXCEPTION]", e.message);
        console.groupEnd();
        res.status(500).json({ message: 'Internal server error.' });
    }
};

// Add this new function to your callController.js

/**
 * GET Dispatch Details by Order ID
 * Route: GET /call/dispatch/details/:orderId
 * Purpose: Fetch full dispatch record for re-dispatch scenarios
 */
exports.getDispatchDetailsByOrderId = async (req, res) => {
    console.group("📋 [GET DISPATCH DETAILS BY ORDER ID]");
    
    if (!empSupabase) {
        console.error("❌ [ERROR] Employee DB not configured.");
        console.groupEnd();
        return res.status(500).json({ message: 'Employee database unavailable.' });
    }

    const { orderId } = req.params;

    if (!orderId) {
        console.error("⚠️ [ERROR] Missing order_id parameter.");
        console.groupEnd();
        return res.status(400).json({ message: 'Order ID is required.' });
    }

    try {
        console.log(`[QUERY] Fetching dispatch details for Order ID: ${orderId}`);

        // Query the dispatch table in Employee DB
        const { data, error } = await empSupabase
            .from('dispatch')
            .select('*')
            .eq('order_id', orderId)
            .limit(1)
            .single(); // We expect only one record

        if (error) {
            console.error("❌ [DB ERROR]", error.message);
            console.groupEnd();
            return res.status(404).json({ 
                message: 'Dispatch record not found.',
                details: error.message 
            });
        }

        if (!data) {
            console.warn("⚠️ [WARNING] No dispatch record found for this Order ID.");
            console.groupEnd();
            return res.status(404).json({ 
                message: 'No dispatch record found for this Order ID.' 
            });
        }

        console.log("✅ [SUCCESS] Dispatch details retrieved:", data);
        console.groupEnd();

        // Return the full dispatch record
        res.status(200).json(data);

    } catch (e) {
        console.error("🛑 [EXCEPTION]", e.message);
        console.groupEnd();
        res.status(500).json({ 
            message: 'Internal server error while fetching dispatch details.',
            error: e.message 
        });
    }
};
// ======================================================================
// COMPLETE FIXED: Dispatch Serviceman with Customer Name Support
// ======================================================================

exports.dispatchServiceman = async (req, res) => {
    console.group("📝 [FULL DISPATCH PROCESS]");

    if (!empSupabase) {
        console.error("❌ [ERROR] Employee DB not configured.");
        console.groupEnd();
        return res.status(500).json({ message: 'Employee database unavailable.' });
    }

    const dispatchData = req.body;
    let { 
        order_id, category, user_id, 
        member_id, phone_number, request_address, 
        order_status, order_request, 
        address_id,
        ticket_id,
        admin_id,
        scheduled_time,
        customer_name, // 🔥 NEW: Accept customer_name from frontend (for scheduled orders)
        isScheduledUpdate // Flag indicating this is updating an existing scheduled order
    } = dispatchData; 

    let customerUserId = null;
    let resolvedMemberId = member_id;
    let resolvedAddressId = address_id;
    let resolvedCustomerName = customer_name || 'Unknown Customer'; // 🔥 FIX: Use customer_name from payload first

    console.log(`[DISPATCH INPUT] customer_name from payload: "${customer_name}"`);

    // Validation: For scheduled updates, we MUST have user_id (serviceman)
    if (isScheduledUpdate && !user_id) {
        console.error("⚠️ [ERROR] Scheduled update requires serviceman user_id.");
        console.groupEnd();
        return res.status(400).json({ message: 'Serviceman ID required for scheduled order assignment.' });
    }

    const isScheduled = order_status === 'Scheduled';
    
    if (!order_id || (!user_id && !isScheduled) || !category || !ticket_id) {
        console.error(`⚠️ [ERROR] Missing essential dispatch data. User ID missing? ${!user_id}. Status: ${order_status}`);
        console.groupEnd();
        return res.status(400).json({ message: 'Missing essential dispatch data.' });
    }
    
    if (!admin_id) {
        console.error("⚠️ [ERROR] Missing admin_id for dispatch record.");
        admin_id = 'UNKNOWN_ADMIN'; 
    }

    try {
        // STEP 1: Lookup Customer Identifiers (if not provided)
        if (!resolvedMemberId && phone_number) {
            const dbPhoneNumber = String(phone_number).replace(/[^0-9]/g, '');

            const { data: allowedData, error: allowedError } = await supabase
                .from('AllowedNumber')
                .select('user_id, member_id')
                .eq('phone_number', dbPhoneNumber)
                .limit(1);

            if (allowedError || !allowedData || allowedData.length === 0) {
                console.error("❌ [MAIN DB LOOKUP ERROR] Customer not found via phone number.");
                customerUserId = null; 
            } else {
                resolvedMemberId = allowedData[0].member_id;
                customerUserId = allowedData[0].user_id;
            }

        } else if (resolvedMemberId) {
            const { data: allowedData, error: allowedError } = await supabase
                .from('AllowedNumber')
                .select('user_id')
                .eq('member_id', resolvedMemberId)
                .limit(1);
            
            if (allowedError || !allowedData || allowedData.length === 0) {
                console.error("❌ [MAIN DB LOOKUP ERROR] Customer User ID not found.");
                console.groupEnd();
                return res.status(500).json({ message: 'Member ID lookup failed.' });
            }

            customerUserId = allowedData[0].user_id;
        } else {
            console.error("❌ [ERROR] Missing customer identifier.");
            console.groupEnd();
            return res.status(400).json({ message: 'Missing required customer identifier.' });
        }
        
        // 🔥 FIX: Only fetch customer name from DB if NOT already provided in payload
        if (!customer_name || customer_name === 'Unknown Customer') {
            console.log("🔍 [NAME FETCH] Customer name not in payload, fetching from database...");
            if (customerUserId) {
                try {
                    resolvedCustomerName = await fetchCustomerName(customerUserId, resolvedMemberId);
                    console.log(`✅ [CUSTOMER NAME FETCHED FROM DB] Name: ${resolvedCustomerName}`);
                } catch (nameError) {
                    console.error("⚠️ [CUSTOMER NAME ERROR]", nameError);
                    resolvedCustomerName = 'Unknown Customer';
                }
            }
        } else {
            console.log(`✅ [CUSTOMER NAME FROM PAYLOAD] Using provided name: ${resolvedCustomerName}`);
        }

        // Resolve Address ID
        if (!resolvedAddressId && customerUserId) {
            const { data: addressData } = await supabase
                .from('Address')
                .select('address_id')
                .eq('user_id', customerUserId)
                .limit(1);

            if (addressData && addressData.length > 0) {
                resolvedAddressId = addressData[0].address_id;
            }
        }
        
        // STEP 2: Handle Employee DB (Dispatch Table) - UPDATE or INSERT
        if (isScheduledUpdate) {
            // UPDATE existing dispatch record
            console.log(`🔄 [SCHEDULED UPDATE] Updating Order ID: ${order_id} with serviceman: ${user_id}`);
            
            const updateData = {
                user_id: user_id,
                order_status: 'Assigned',
                updated_at: new Date().toISOString(),
            };

            const { data: empUpdateData, error: empUpdateError } = await empSupabase
                .from('dispatch')
                .update(updateData)
                .eq('order_id', order_id)
                .select('*');

            if (empUpdateError) {
                console.error("❌ [EMPLOYEE DB UPDATE ERROR]", empUpdateError.message);
                console.groupEnd();
                return res.status(500).json({ message: 'Failed to update Dispatch table.' });
            }

            console.log("✅ [EMPLOYEE DB] Dispatch record updated successfully.");

        } else {
            // INSERT new dispatch record (normal flow or scheduled)
            const employeeDbData = {
                order_id, 
                user_id: user_id || null,
                category,
                request_address,
                order_status: order_status || 'Assigned',
                order_request,
                phone_number,
                ticket_id,
                dispatched_at: new Date().toISOString(),
                customer_name: resolvedCustomerName, // 🔥 FIX: Now uses the correct name
                admin_id: admin_id,
                scheduled_time: scheduled_time || null
            };

            console.log(`[EMPLOYEE DB INSERT] customer_name being saved: "${resolvedCustomerName}"`);

            const { data: empData, error: empError } = await empSupabase
                .from('dispatch') 
                .insert([employeeDbData])
                .select('*');

            if (empError) {
                console.error("❌ [EMPLOYEE DB ERROR]", empError.message);
                console.groupEnd();
                return res.status(500).json({ message: 'Failed to insert into Dispatch table.' });
            }

            console.log("✅ [EMPLOYEE DB] New dispatch record created with customer_name:", empData[0].customer_name);
        }

        // STEP 3: Handle Main DB (Order Table) - UPDATE or INSERT
        const currentTimestamp = new Date().toISOString();
        const targetDate = scheduled_time ? new Date(scheduled_time).toISOString() : currentTimestamp;

        if (isScheduledUpdate) {
            // UPDATE existing order record
            console.log(`🔄 [ORDER UPDATE] Updating Order ID: ${order_id} status to Assigned`);
            
            const orderUpdateData = {
                order_status: 'Assigned',
                updated_at: currentTimestamp,
            };

            const { error: orderUpdateError } = await supabase
                .from('Order')
                .update(orderUpdateData)
                .eq('order_id', order_id);

            if (orderUpdateError) {
                console.error("❌ [MAIN DB ORDER UPDATE ERROR]", orderUpdateError.message);
                console.groupEnd();
                return res.status(500).json({ 
                    message: 'Dispatch updated, but Order status update failed.', 
                    details: orderUpdateError.message 
                });
            }

            console.log("✅ [MAIN DB] Order status updated to Assigned.");

        } else {
            // INSERT new order record (normal flow)
            const mainDbOrderData = {
                order_id: order_id,
                user_id: customerUserId, 
                member_id: resolvedMemberId, 
                address_id: resolvedAddressId,
                service_category: category,
                service_subcategory: category || 'General Service', 
                work_description: order_request, 
                order_status: order_status || 'Assigned',
                scheduled_date: targetDate,
                preferred_time: scheduled_time ? new Date(scheduled_time).toLocaleTimeString() : '9:00 AM - 1:00 PM', 
                created_at: currentTimestamp, 
                updated_at: currentTimestamp, 
            };

            const { error: orderError } = await supabase
                .from('Order') 
                .insert([mainDbOrderData]);

            if (orderError) {
                console.error("❌ [MAIN DB ORDER ERROR]", orderError.message);
                console.groupEnd();
                return res.status(500).json({ 
                    message: 'Dispatch/Schedule recorded, but Order record failed.', 
                    details: orderError.message 
                });
            }

            console.log("✅ [MAIN DB] New order record created.");
        }

        console.log(`✅ [SUCCESS] ${isScheduledUpdate ? 'Scheduled order assigned' : 'Process Complete'}. Status: ${order_status || 'Assigned'}`);
        console.groupEnd();
        
        res.status(isScheduledUpdate ? 200 : 201).json({
            message: isScheduledUpdate 
                ? 'Scheduled order assigned successfully.' 
                : (order_status === 'Scheduled' ? 'Appointment Scheduled successfully.' : 'Serviceman dispatched successfully.'),
            dispatch_id: order_id,
            order_id: order_id
        });

    } catch (e) {
        console.error("🛑 [EXCEPTION]", e.message);
        console.groupEnd();
        res.status(500).json({ message: 'Internal server error.' });
    }
};
// ======================================================================
// 🚀 NEW: ORDER MANAGEMENT (Assigned Orders & Cancellation)
// ======================================================================

/**
 * 🚀 GET: Fetch all 'Assigned' orders for a specific member via phone number.
 * Logic: Phone -> AllowedNumber(member_id) -> Order(member_id)
 * URL: /call/orders/assigned?phoneNumber=...
 */
exports.getAssignedOrders = async (req, res) => {
    const { phoneNumber } = req.query;

    if (!phoneNumber) {
        console.log("⚠️ [ASSIGNED ORDERS] Phone number is missing in query.");
        return res.status(400).json({ message: "Phone number is required." });
    }

    const dbPhoneNumber = phoneNumber.replace(/[^0-9]/g, '');
    console.log(`🔎 [ASSIGNED ORDERS] Starting lookup for phone: ${dbPhoneNumber}`);

    try {
        // 1. Get MEMBER ID from Phone Number (Table: AllowedNumber)
        const { data: allowedData, error: allowedError } = await supabase
            .from('AllowedNumber')
            .select('member_id')
            .eq('phone_number', dbPhoneNumber)
            .limit(1);

        if (allowedError) {
            console.error("❌ [ASSIGNED ORDERS] AllowedNumber DB Error:", allowedError.message);
            return res.status(500).json({ message: "Database error looking up member." });
        }

        if (!allowedData || allowedData.length === 0) {
            console.warn("⚠️ [ASSIGNED ORDERS] Member ID not found for phone number. Returning empty array.");
            return res.status(200).json({ orders: [] }); // Return 200 with empty list if member not found
        }

        const memberId = allowedData[0].member_id;
        console.log(`✅ [ASSIGNED ORDERS] Found Member ID: ${memberId}.`);
        console.log(`🔎 [ASSIGNED ORDERS] Querying Order table for status 'Assigned'...`);


        // 2. Query Order table for 'Assigned' status using MEMBER ID
        const { data: orders, error: orderError } = await supabase
            .from('Order')
            .select('order_id, order_status, work_description') // Only select necessary fields
            .eq('member_id', memberId)
            .eq('order_status', 'Assigned')
            .order('created_at', { ascending: false });

        if (orderError) {
            console.error("❌ [ASSIGNED ORDERS] Order Fetch Error:", orderError.message);
            return res.status(500).json({ message: "Database error fetching orders." });
        }
        
        const count = orders ? orders.length : 0;
        console.log(`✨ [ASSIGNED ORDERS] Found ${count} assigned orders for member ${memberId}.`);

        // Map 'work_description' to 'request_details' for frontend
        const mappedOrders = orders.map(o => ({
            ...o,
            request_details: o.work_description || "Service Request" 
        }));

        res.status(200).json({ orders: mappedOrders });

    } catch (e) {
        console.error("🛑 [ASSIGNED ORDERS EXCEPTION]", e.message);
        res.status(500).json({ message: "Server error." });
    }
};

/**
 * 🚀 PUT: Cancel an Order (Change status to 'Cust_Cancelled')
 * Updates both Main DB (Order) and Employee DB (Dispatch)
 * URL: /call/orders/cancel
 */
exports.cancelOrder = async (req, res) => {
    const { orderId, status } = req.body; // Expecting status: 'Cust_Cancelled'
    
    if (!orderId) {
        return res.status(400).json({ message: "Order ID is required." });
    }

    const newStatus = status || 'Cust_Cancelled';
    console.log(`🚫 [CANCEL ORDER] Request for Order #${orderId} -> ${newStatus}`);

    try {
        // 1. Update Main DB (Order Table)
        // **CRITICAL UPDATE: Use .single() and check data for success/failure in Supabase.**
        const { data: mainData, error: mainError } = await supabase
            .from('Order')
            .update({ order_status: newStatus, updated_at: new Date().toISOString() })
            .eq('order_id', orderId)
            .select('order_id')
            .maybeSingle(); // Use maybeSingle to get null/error if no rows match

        if (mainError) {
            console.error("❌ Main DB Update Failed (DB Error):", mainError.message);
            // This captures the permission error if it was a Supabase RLS failure
            return res.status(500).json({ message: "Failed to update Order status due to database error.", details: mainError.message });
        }
        
        // **If data is null, it means the row was not found (or not updated due to RLS).**
        if (!mainData) {
            console.error(`⚠️ Main DB Update Failed: Order ID ${orderId} not found or update blocked (0 rows affected).`);
            return res.status(404).json({ message: `Order ID ${orderId} not found or already cancelled.` });
        }
        
        console.log(`✅ Main DB Order #${orderId} status set to ${newStatus}.`);


        // 2. Update Employee DB (Dispatch Table) if connected
        if (empSupabase) {
            const { error: empError } = await empSupabase
                .from('dispatch')
                .update({ order_status: newStatus, updated_at: new Date().toISOString() })
                .eq('order_id', orderId); // Assuming dispatch table uses same order_id

            if (empError) {
                console.error("⚠️ Employee DB Update Failed (Order might persist for agent):", empError.message);
                // We don't fail the whole request, but log the warning.
            } else {
                console.log("✅ Employee Dispatch updated to Cancelled.");
            }
        }

        res.status(200).json({ message: "Order cancelled successfully." });

    } catch (e) {
        console.error("🛑 [EXCEPTION]", e.message);
        res.status(500).json({ message: "Server error during cancellation." });
    }
};







