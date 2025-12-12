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
// 3. EMPLOYEE SUPABASE (Servicemen Lookup/Dispatch)
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
 */
const fetchCustomerName = async (customerUserId, resolvedMemberId) => {
    if (!customerUserId) {
        console.log("⚠️ [NAME LOOKUP] No customerUserId provided.");
        return 'Unknown Customer';
    }

    try {
        let customerName = null;

        if (resolvedMemberId) {
            console.log(`🔎 [NAME LOOKUP] Trying Member table for member_id: ${resolvedMemberId}`);
            const { data: memberData, error: memberError } = await supabase
                .from('Member')
                .select('name')
                .eq('member_id', resolvedMemberId)
                .limit(1);

            if (memberError) {
                console.error(`❌ [NAME LOOKUP] Member DB Error: ${memberError.message}`);
            } else if (memberData && memberData.length > 0) {
                customerName = memberData[0].name;

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

        console.log(`🔎 [NAME LOOKUP] Falling back to User table for user_id: ${customerUserId}`);
        const { data: userData, error: userError } = await supabase
            .from('User')
            .select('name')
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
 * Check if the caller is an internal EMPLOYEE.
 */
const checkIfCallerIsEmployee = async (phoneNumber) => {
    if (!empSupabase) {
        console.warn("⚠️ Employee DB not connected. Skipping check.");
        return null;
    }

    const trimmedPhoneNumber = phoneNumber.trim();
    const dbPhoneNumber = trimmedPhoneNumber.replace(/[^\d+]/g, ''); 
    
    console.log(`> Raw Input: "${phoneNumber}"`);
    console.log(`> Database Key (Normalized): "${dbPhoneNumber}"`);

    try {
        console.log(`> Querying 'users' table where mobile_number = '${dbPhoneNumber}'...`);
        
        const { data, error } = await empSupabase
            .from('users') 
            .select('*')
            .eq('mobile_number', dbPhoneNumber)
            .limit(1);

        if (error) {
            console.error(`❌ DB Query Error: ${error.message}`);
            return null;
        }

        console.log(`> Result Rows Found: ${data ? data.length : 0}`);

        if (data && data.length > 0) {
            const employee = data[0];
            console.log(`✅ MATCH FOUND!`);
            console.log(`    - Name: ${employee.name}`);
            console.log(`    - Role: ${employee.role}`);
            console.log(`    - ID: ${employee.id}`);
            
            return {
                isEmployee: true,
                userName: `${employee.name} (Employee)`,
                subscriptionStatus: "Internal Staff",
                dashboardLink: "/employeehelpdesk",
                ticket: `Internal Call - ${employee.role || 'Staff'}`,
                employeeData: employee
            };
        } else {
            console.log("❌ No match in 'users' table.");
            return null; 
        }

    } catch (e) {
        console.error(`🛑 Exception in Employee Check: ${e.message}`);
        return null;
    }
};

/**
 * Standard Subscription Status Check (Regular Customer).
 */
exports.checkSubscriptionStatus = async (phoneNumber) => {
    const dbPhoneNumber = phoneNumber.replace(/[^0-9]/g, '');

    try {
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
 * Fetches the parent user_id from the Main Supabase 'AllowedNumber' table
 */
exports.getUserIdByPhoneNumber = async (req, res) => {
    console.group("🔎 [USER ID LOOKUP START]");
    const { phoneNumber } = req.query;
    
    if (!phoneNumber) {
        console.error("🛑 [USER ID LOOKUP FAIL] Missing phoneNumber in query parameters.");
        console.groupEnd();
        return res.status(400).json({ message: 'Phone number is required.' });
    }
    
    const dbPhoneNumber = String(phoneNumber).replace(/[^0-9]/g, '');
    
    console.log(`[QUERY] Searching 'AllowedNumber' for: "${dbPhoneNumber}"`);
    
    try {
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
            return res.status(404).json({ 
                message: 'User ID not found for this phone number.' 
            });
        }
        
        console.log(`✅ [USER ID SUCCESS] Found User ID: ${userId}`);
        console.groupEnd();

        res.status(200).json({ 
            success: true,
            userId: userId,
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

/**
 * Fetches Employee Details by Mobile Number
 */
exports.getEmployeeDetailsByMobile = async (req, res) => {
    console.log("📞 API: EMPLOYEE DETAILS LOOKUP ATTEMPT");
    
    try {
        console.group("📞 API: EMPLOYEE DETAILS LOOKUP START");

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

        let dbPhoneNumber = String(mobile_number).trim().replace(/[^\d+]/g, ''); 
        if (!dbPhoneNumber.startsWith('+')) {
            dbPhoneNumber = '+' + dbPhoneNumber;
        }

        console.log(`🔎 [API: EMP DETAILS] Raw Input: "${mobile_number}". Database Key: "${dbPhoneNumber}"`);
        console.log(`📡 [API: EMP DETAILS] Querying 'users' table for mobile_number = '${dbPhoneNumber}'...`);
        
        const { data, error } = await empSupabase
            .from('users')
            .select('uid, mobile_number')
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
        console.log(`✅ [API: EMP DETAILS] Match Found! UID: ${employee.uid}`);
        
        res.status(200).json({
            success: true,
            user_id: employee.uid,
            employee_name: null,
            mobile_number: employee.mobile_number,
        });
        console.groupEnd();

    } catch (e) {
        console.error("🛑 [API: EMP DETAILS EXCEPTION]:", e.message, e.stack);
        try { console.groupEnd(); } catch(err) {} 
        res.status(500).json({ 
            message: 'Internal server error.',
            details: e.message
        });
    }
};

/**
 * Fetches active dispatch by user ID
 */
exports.getActiveDispatchByUserId = async (req, res) => {
    console.log("📞 API: ACTIVE DISPATCH LOOKUP ATTEMPT");
    
    try {
        console.group("📞 API: ACTIVE DISPATCH LOOKUP START");
        const { user_id } = req.query;

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

        console.log(`🔎 [API: DISPATCH DETAILS] Target Employee user_id: ${user_id}`);
        
        const requiredStatus = 'Assigned';
        console.log(`📡 [API: DISPATCH DETAILS] Querying 'dispatch' table for user_id = '${user_id}'. Required status: '${requiredStatus}'`);

        const { data, error } = await empSupabase
            .from('dispatch')
            .select('*')
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
            console.log("ℹ️ [API: DISPATCH DETAILS] No matching dispatch record found.");
            console.groupEnd();
            return res.status(200).json({ 
                message: 'No active dispatch found for this employee.',
                dispatchData: {} 
            });
        }

        const dispatchRecord = data[0];
        console.log(`✅ [API: DISPATCH DETAILS] Found active Order ID: ${dispatchRecord.order_id}, Status: ${dispatchRecord.order_status}`);
        
        res.status(200).json({
            success: true,
            dispatchData: dispatchRecord
        });
        console.groupEnd();

    } catch (e) {
        console.error("🛑 [API: DISPATCH DETAILS EXCEPTION]:", e.message, e.stack);
        try { console.groupEnd(); } catch(err) {} 
        res.status(500).json({ message: 'Internal server error.' });
    }
};

/**
 * Cancels an active dispatch order
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
 * Fetches member_id AND customer_name from AllowedNumber table
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
        
        res.status(200).json({ 
            message: 'Member ID and name fetched successfully.', 
            member_id: memberId,
            customer_name: customerName
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

    const employeeResult = await checkIfCallerIsEmployee(incomingNumber);

    if (employeeResult && employeeResult.isEmployee) {
        console.log("⚡ [ROUTING] Caller is an INTERNAL EMPLOYEE.");
        
        callData = {
            caller: incomingNumber,
            name: employeeResult.userName,
            subscriptionStatus: "Internal Staff",
            dashboardLink: employeeResult.dashboardLink,
            ticket: employeeResult.ticket,
            isExistingUser: true,
            isEmployeeCall: true,
            dispatchData: null
        };

    } else {
        console.log("ℹ️ [ROUTING] No Dispatch/Employee record. Checking User Subscription.");
        const userData = await exports.checkSubscriptionStatus(incomingNumber);
        
        callData = {
            caller: incomingNumber,
            name: userData.userName,
            subscriptionStatus: userData.subscriptionStatus,
            dashboardLink: userData.dashboardLink,
            ticket: userData.ticket,
            isExistingUser: userData.hasActiveSubscription,
            isEmployeeCall: false
        };
    } 
    
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

/**
 * Fetches active servicemen filtered by category AND subcategories.
 */
exports.getAvailableServicemen = async (req, res) => {
    console.group("🔍 [SERVICEMEN LOOKUP WITH SUBCATEGORIES]");
    
    if (!empSupabase) {
        console.error("❌ [ERROR] Employee DB not configured.");
        console.groupEnd();
        return res.status(500).json({ message: 'Employee database unavailable.' });
    }

    const { service, subcategories } = req.body; 
    console.log(`[INFO] Searching for service: '${service}'`);
    console.log(`[INFO] Requested subcategories:`, subcategories);

    if (!service) {
        console.error("⚠️ [ERROR] No service specified.");
        console.groupEnd();
        return res.status(400).json({ message: 'Service type is required.' });
    }

    try {
        let query = empSupabase
            .from('services')
            .select('*')
            .eq('is_active', true)
            .ilike('category', `%${service}%`);

        const { data, error } = await query;

        if (error) {
            console.error("❌ [SUPABASE ERROR]", JSON.stringify(error, null, 2));
            console.groupEnd();
            return res.status(500).json({ message: 'Database query failed.', details: error.message });
        }

        if (!data || data.length === 0) {
            console.log(`⚠️ [NO RESULTS] No servicemen found for category: ${service}`);
            console.groupEnd();
            return res.status(200).json([]);
        }

        console.log(`✅ [QUERY SUCCESS] Found ${data.length} servicemen for category: ${service}`);

        let filteredData = data;

        if (subcategories && Array.isArray(subcategories) && subcategories.length > 0) {
            console.log(`🔎 [SUBCATEGORY FILTER] Filtering by ${subcategories.length} subcategories...`);

            filteredData = data.map(serviceman => {
                const servicemanSubcategories = serviceman.sub_categories || [];
                
                const matchedSubcategories = subcategories.filter(reqSub => 
                    servicemanSubcategories.some(smSub => 
                        smSub.toLowerCase().includes(reqSub.toLowerCase()) ||
                        reqSub.toLowerCase().includes(smSub.toLowerCase())
                    )
                );

                return {
                    ...serviceman,
                    matchedSubcategories: matchedSubcategories,
                    subcategoryMatchScore: matchedSubcategories.length
                };
            })
            .filter(sm => sm.subcategoryMatchScore > 0)
            .sort((a, b) => b.subcategoryMatchScore - a.subcategoryMatchScore);

            console.log(`✅ [FILTER COMPLETE] ${filteredData.length} servicemen match the requested subcategories.`);
            
            filteredData.forEach(sm => {
                console.log(`  - ${sm.full_name || sm.name}: Matched ${sm.subcategoryMatchScore} subcategories: ${sm.matchedSubcategories.join(', ')}`);
            });
        } else {
            console.log(`ℹ️ [NO SUBCATEGORY FILTER] Returning all servicemen for category.`);
        }

        console.groupEnd();
        res.status(200).json(filteredData);

    } catch (e) {
        console.error("🛑 [EXCEPTION]", e.message);
        console.groupEnd();
        res.status(500).json({ message: 'Internal server error.' });
    }
};

/**
 * 🚀 UPDATED: Dispatch handler now accepts selected_subcategories and handles app orders.
 */
exports.dispatchServiceman = async (req, res) => {
    console.group("📝 [FULL DISPATCH PROCESS WITH APP ORDER SUPPORT]");

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
        customer_name,
        isScheduledUpdate,
        isAppOrderUpdate, // 🚀 NEW: Flag for app-placed orders
        selected_subcategories,
        customer_user_id, // 🚀 NEW: For app orders
        customer_member_id, // 🚀 NEW: For app orders
        customer_address_id // 🚀 NEW: For app orders
    } = dispatchData;

    let customerUserId = customer_user_id || null;
    let resolvedMemberId = customer_member_id || member_id;
    let resolvedAddressId = customer_address_id || address_id;
    let resolvedCustomerName = customer_name || 'Unknown Customer';

    console.log(`[DISPATCH INPUT] Category: ${category}, Subcategories:`, selected_subcategories);
    console.log(`[DISPATCH TYPE] Scheduled: ${isScheduledUpdate}, App Order: ${isAppOrderUpdate}`);

    if ((isScheduledUpdate || isAppOrderUpdate) && !user_id) {
        console.error("⚠️ [ERROR] Order assignment requires serviceman user_id.");
        console.groupEnd();
        return res.status(400).json({ message: 'Serviceman ID required for order assignment.' });
    }

    const isScheduled = order_status === 'Scheduled';

    if (!order_id || (!user_id && !isScheduled) || !category || !ticket_id) {
        console.error(`⚠️ [ERROR] Missing essential dispatch data.`);
        console.groupEnd();
        return res.status(400).json({ message: 'Missing essential dispatch data.' });
    }

    if (!admin_id) {
        console.error("⚠️ [ERROR] Missing admin_id for dispatch record.");
        admin_id = 'UNKNOWN_ADMIN';
    }

    try {
        // For app orders, use provided IDs; otherwise, lookup
        if (!isAppOrderUpdate && !resolvedMemberId && phone_number) {
            const dbPhoneNumber = String(phone_number).replace(/[^0-9]/g, '');

            const { data: allowedData, error: allowedError } = await supabase
                .from('AllowedNumber')
                .select('user_id, member_id')
                .eq('phone_number', dbPhoneNumber)
                .limit(1);

            if (allowedError || !allowedData || allowedData.length === 0) {
                console.error("❌ [MAIN DB LOOKUP ERROR] Customer not found.");
                customerUserId = null;
            } else {
                resolvedMemberId = allowedData[0].member_id;
                customerUserId = allowedData[0].user_id;
            }
        } else if (!isAppOrderUpdate && resolvedMemberId) {
            const { data: allowedData } = await supabase
                .from('AllowedNumber')
                .select('user_id')
                .eq('member_id', resolvedMemberId)
                .limit(1);

            if (allowedData && allowedData.length > 0) {
                customerUserId = allowedData[0].user_id;
            }
        }

        // Fetch customer name if not provided
        if (!customer_name || customer_name === 'Unknown Customer') {
            if (customerUserId) {
                try {
                    resolvedCustomerName = await fetchCustomerName(customerUserId, resolvedMemberId);
                } catch (nameError) {
                    console.error("⚠️ [CUSTOMER NAME ERROR]", nameError);
                    resolvedCustomerName = 'Unknown Customer';
                }
            }
        }

        // Resolve Address ID if not provided
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

        // Employee DB (Dispatch Table) - UPDATE or INSERT
        if (isScheduledUpdate) {
            // SCHEDULED ORDER: Update existing dispatch record
            const updateData = {
                user_id: user_id,
                order_status: 'Assigned',
                updated_at: new Date().toISOString(),
            };

            const { error: empUpdateError } = await empSupabase
                .from('dispatch')
                .update(updateData)
                .eq('order_id', order_id);

            if (empUpdateError) {
                console.error("❌ [EMPLOYEE DB UPDATE ERROR]", empUpdateError.message);
                console.groupEnd();
                return res.status(500).json({ message: 'Failed to update Dispatch table.' });
            }

            console.log("✅ [EMPLOYEE DB] Dispatch record updated for scheduled order.");

        } else if (isAppOrderUpdate) {
            // APP ORDER: Insert NEW dispatch record (no pre-existing record)
            let enhancedOrderRequest = order_request;
            if (selected_subcategories && selected_subcategories.length > 0) {
                enhancedOrderRequest = `${order_request} | Requested Services: ${selected_subcategories.join(', ')}`;
            }

            const employeeDbData = {
                order_id,
                user_id: user_id,
                category,
                request_address,
                order_status: 'Assigned',
                order_request: enhancedOrderRequest,
                phone_number,
                ticket_id: ticket_id || 'APP_ORDER',
                dispatched_at: new Date().toISOString(),
                customer_name: resolvedCustomerName,
                admin_id: admin_id,
                scheduled_time: null
            };

            const { error: empInsertError } = await empSupabase
                .from('dispatch')
                .insert([employeeDbData]);

            if (empInsertError) {
                console.error("❌ [EMPLOYEE DB INSERT ERROR]", empInsertError.message);
                console.groupEnd();
                return res.status(500).json({ message: 'Failed to insert into Dispatch table for app order.' });
            }

            console.log("✅ [EMPLOYEE DB] Dispatch record created for app order.");

        } else {
            // NEW ORDER: Insert dispatch record
            let enhancedOrderRequest = order_request;
            if (selected_subcategories && selected_subcategories.length > 0) {
                enhancedOrderRequest = `${order_request} | Requested Services: ${selected_subcategories.join(', ')}`;
            }

            const employeeDbData = {
                order_id,
                user_id: user_id || null,
                category,
                request_address,
                order_status: order_status || 'Assigned',
                order_request: enhancedOrderRequest,
                phone_number,
                ticket_id,
                dispatched_at: new Date().toISOString(),
                customer_name: resolvedCustomerName,
                admin_id: admin_id,
                scheduled_time: scheduled_time || null
            };

            const { error: empError } = await empSupabase
                .from('dispatch')
                .insert([employeeDbData]);

            if (empError) {
                console.error("❌ [EMPLOYEE DB ERROR]", empError.message);
                console.groupEnd();
                return res.status(500).json({ message: 'Failed to insert into Dispatch table.' });
            }

            console.log("✅ [EMPLOYEE DB] Dispatch record created with subcategories.");
        }

        // Main DB (Order Table) - UPDATE or INSERT
        const currentTimestamp = new Date().toISOString();
        const targetDate = scheduled_time ? new Date(scheduled_time).toISOString() : currentTimestamp;

        if (isScheduledUpdate) {
            // SCHEDULED ORDER: Update existing order
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

            console.log("✅ [MAIN DB] Scheduled order status updated to Assigned.");

        } else if (isAppOrderUpdate) {
            // APP ORDER: Update existing order from "Placing" to "Assigned"
            const orderUpdateData = {
                order_status: 'Assigned',
                updated_at: currentTimestamp,
            };

            console.log(`🔄 [MAIN DB] Updating app order ${order_id} from Placing to Assigned...`);

            const { data: updatedOrder, error: orderUpdateError } = await supabase
                .from('Order')
                .update(orderUpdateData)
                .eq('order_id', order_id)
                .select();

            if (orderUpdateError) {
                console.error("❌ [MAIN DB APP ORDER UPDATE ERROR]", orderUpdateError.message);
                console.groupEnd();
                return res.status(500).json({
                    message: 'Dispatch created, but app order status update failed.',
                    details: orderUpdateError.message
                });
            }

            if (!updatedOrder || updatedOrder.length === 0) {
                console.error("⚠️ [MAIN DB] No rows updated. Order may not exist or RLS policy blocked update.");
                console.groupEnd();
                return res.status(404).json({
                    message: 'Order not found or update blocked.',
                });
            }

            console.log("✅ [MAIN DB] App order status updated to Assigned:", updatedOrder[0]);

        } else {
            // NEW ORDER: Insert new order record
            const subcategoryString = selected_subcategories && selected_subcategories.length > 0
                ? selected_subcategories.join(', ')
                : category;

            const mainDbOrderData = {
                order_id: order_id,
                user_id: customerUserId,
                member_id: resolvedMemberId,
                address_id: resolvedAddressId,
                service_category: category,
                service_subcategory: subcategoryString,
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
                    message: 'Dispatch recorded, but Order record failed.',
                    details: orderError.message
                });
            }

            console.log("✅ [MAIN DB] Order record created with subcategories.");
        }

        console.log(`✅ [SUCCESS] Dispatch complete for ${category}.`);
        console.groupEnd();

        res.status((isScheduledUpdate || isAppOrderUpdate) ? 200 : 201).json({
            message: (isScheduledUpdate || isAppOrderUpdate)
                ? 'Order assigned successfully.'
                : (order_status === 'Scheduled' ? 'Appointment scheduled.' : 'Serviceman dispatched successfully.'),
            dispatch_id: order_id,
            order_id: order_id
        });

    } catch (e) {
        console.error("🛑 [EXCEPTION]", e.message);
        console.groupEnd();
        res.status(500).json({ message: 'Internal server error.' });
    }
};

/**
 * Fetches dispatch details by Order ID.
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

/**
 * GET Dispatch Details by Order ID
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

        const { data, error } = await empSupabase
            .from('dispatch')
            .select('*')
            .eq('order_id', orderId)
            .limit(1)
            .single();

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

/**
 * Fetches all 'Assigned' orders for a specific member via phone number.
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
            return res.status(200).json({ orders: [] });
        }

        const memberId = allowedData[0].member_id;
        console.log(`✅ [ASSIGNED ORDERS] Found Member ID: ${memberId}.`);
        console.log(`🔎 [ASSIGNED ORDERS] Querying Order table for status 'Assigned'...`);

        const { data: orders, error: orderError } = await supabase
            .from('Order')
            .select('order_id, order_status, work_description')
            .eq('member_id', memberId)
            .eq('order_status', 'Assigned')
            .order('created_at', { ascending: false });

        if (orderError) {
            console.error("❌ [ASSIGNED ORDERS] Order Fetch Error:", orderError.message);
            return res.status(500).json({ message: "Database error fetching orders." });
        }
        
        const count = orders ? orders.length : 0;
        console.log(`✨ [ASSIGNED ORDERS] Found ${count} assigned orders for member ${memberId}.`);

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
 * Cancels an Order (Change status to 'Cust_Cancelled')
 */
exports.cancelOrder = async (req, res) => {
    const { orderId, status } = req.body;
    
    if (!orderId) {
        return res.status(400).json({ message: "Order ID is required." });
    }

    const newStatus = status || 'Cust_Cancelled';
    console.log(`🚫 [CANCEL ORDER] Request for Order #${orderId} -> ${newStatus}`);

    try {
        const { data: mainData, error: mainError } = await supabase
            .from('Order')
            .update({ order_status: newStatus, updated_at: new Date().toISOString() })
            .eq('order_id', orderId)
            .select('order_id')
            .maybeSingle();

        if (mainError) {
            console.error("❌ Main DB Update Failed (DB Error):", mainError.message);
            return res.status(500).json({ message: "Failed to update Order status due to database error.", details: mainError.message });
        }
        
        if (!mainData) {
            console.error(`⚠️ Main DB Update Failed: Order ID ${orderId} not found or update blocked.`);
            return res.status(404).json({ message: `Order ID ${orderId} not found or already cancelled.` });
        }
        
        console.log(`✅ Main DB Order #${orderId} status set to ${newStatus}.`);

        if (empSupabase) {
            const { error: empError } = await empSupabase
                .from('dispatch')
                .update({ order_status: newStatus, updated_at: new Date().toISOString() })
                .eq('order_id', orderId);

            if (empError) {
                console.error("⚠️ Employee DB Update Failed:", empError.message);
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

