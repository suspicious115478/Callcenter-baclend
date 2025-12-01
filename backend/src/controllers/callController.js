const { createClient } = require('@supabase/supabase-js');
const agentController = require('./agentController'); 

// Define the two possible redirect paths for the frontend
const CUSTOMER_REDIRECT_PATH = '/new-customer-call'; 
const EMPLOYEE_REDIRECT_PATH = '/employee-helpdesk'; 

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
// 3. EMPLOYEE SUPABASE (Servicemen Lookup/Dispatch/Employee Check) 🚀 CRITICAL
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
    console.warn("⚠️ Missing EMP_SUPABASE credentials. Serviceman lookup/dispatch/employee checks will fail.");
}

// ----------------------------------------------------------------------
// HELPER FUNCTIONS 
// ----------------------------------------------------------------------

const handleInactive = (dbPhoneNumber, name) => ({
    hasActiveSubscription: false,
    userName: name,
    subscriptionStatus: "None", 
    dashboardLink: `${CUSTOMER_REDIRECT_PATH}/search?caller=${dbPhoneNumber}`, // Use new constant
    ticket: "New Call - Search Required"
});

/**
 * Fetches the customer name based on member_id or falls back to user_id.
 * (Unchanged logic for customer name lookup)
 */
const fetchCustomerName = async (customerUserId, resolvedMemberId) => {
    // ... (Existing implementation of fetchCustomerName) ...
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
 * Checks the subscription status of a phone number.
 * (Unchanged logic for subscription check)
 */
exports.checkSubscriptionStatus = async (phoneNumber) => {
    const dbPhoneNumber = phoneNumber.replace(/[^0-9]/g, '');

    try {
        // STEP 1: Check AllowedNumber to get parent user_id
        // ... (existing logic) ...

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
        // ... (existing logic) ...
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
                dashboardLink: `/user/dashboard/${userId}`, // This link will be overwritten if it's an employee
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
 * Fetches the specific member_id from the Main Supabase 'AllowedNumber' table
 * based on phone_number. (Unchanged)
 */
exports.getMemberIdByPhoneNumber = async (req, res) => {
    // ... (Existing implementation of getMemberIdByPhoneNumber) ...
    const { phoneNumber } = req.body;

    if (!phoneNumber) {
        console.error("🛑 [MEMBER ID LOOKUP FAIL] Missing phoneNumber in request body.");
        return res.status(400).json({ message: 'Phone number is required.' });
    }
    
    // Normalize phone number
    const dbPhoneNumber = phoneNumber.replace(/[^0-9]/g, '');
    
    console.log(`🔎 [MEMBER ID LOOKUP START] Key: "${dbPhoneNumber}"`);

    try {
        const { data, error } = await supabase
            .from('AllowedNumber')
            .select('member_id, phone_number')
            .eq('phone_number', dbPhoneNumber)
            .limit(1);

        if (error) {
            console.error("❌ [MEMBER ID DB ERROR]", error.message);
            return res.status(500).json({ message: 'Database error during member ID lookup.', details: error.message });
        }
        
        if (!data || data.length === 0) {
            console.warn(`⚠️ [MEMBER ID 404] No records found.`);
            return res.status(404).json({ message: 'Phone number not found.' });
        }

        const memberId = data[0].member_id; 
        console.log(`✅ [MEMBER ID SUCCESS] Found Member ID: ${memberId}`);
        
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
 * 🚀 MODIFIED: Added Employee Check Logic
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
    const dbPhoneNumber = incomingNumber.replace(/[^0-9]/g, '');
    
    // 1. 🎯 CHECK SUPABASE FOR EMPLOYEE NUMBER
    let isEmployeeCall = false;
    let employeeData = null;

    if (empSupabase) {
        console.log(`🔎 [EMPLOYEE CHECK] Looking up: ${dbPhoneNumber} in 'users' table...`);
        try {
            const { data, error } = await empSupabase
                .from('users') // Table name: users
                .select('mobile_number, name')
                .eq('mobile_number', dbPhoneNumber) // Column name: mobile_number
                .limit(1);

            if (error) {
                console.error("❌ [EMPLOYEE CHECK DB ERROR]:", error.message);
            } else if (data && data.length > 0) {
                isEmployeeCall = true;
                employeeData = data[0];
                console.log(`✅ [EMPLOYEE CHECK] Caller is an employee: ${employeeData.name || 'Unknown Employee'}`);
            } else {
                console.log(`[EMPLOYEE CHECK] Caller not found in 'users' table.`);
            }
        } catch (e) {
            console.error("🛑 [EMPLOYEE CHECK EXCEPTION]:", e.message);
        }
    } else {
        console.warn("⚠️ [EMPLOYEE CHECK] Skipped because EMP_SUPABASE is not initialized.");
    }
    
    let callData;

    if (isEmployeeCall) {
        // --- EMPLOYEE FLOW ---
        callData = {
            caller: incomingNumber,
            name: employeeData.name || "Employee Caller",
            subscriptionStatus: "Internal",
            dashboardLink: EMPLOYEE_REDIRECT_PATH, // Redirect to employee helpdesk
            ticket: "Employee Help Desk Call",
            isExistingUser: true,
            type: 'employee' // Added type for frontend distinction
        };
    } else {
        // --- CUSTOMER FLOW --- (Run existing subscription check logic)
        const userData = await exports.checkSubscriptionStatus(incomingNumber);
        
        callData = {
            caller: incomingNumber,
            name: userData.userName,
            subscriptionStatus: userData.subscriptionStatus,
            dashboardLink: userData.dashboardLink.startsWith('/new-customer-call') 
                ? userData.dashboardLink // Keep the full search URL if inactive
                : CUSTOMER_REDIRECT_PATH, // Use base path for active users to launch main flow
            ticket: userData.ticket,
            isExistingUser: userData.hasActiveSubscription,
            type: 'customer' // Added type for frontend distinction
        };
        
        console.log(`[CUSTOMER FLOW] Status: ${callData.subscriptionStatus}. Link: ${callData.dashboardLink}`);
    }
    
    const ioInstance = ioInstanceGetter();
    if (ioInstance) {
        console.log(`[SOCKET EMIT] Sending incoming-call (Type: ${callData.type})...`);
        // Broadcast the final determined callData
        ioInstance.to('call_center_agents').emit("incoming-call", callData);
    }
    
    res.status(200).json({
        message: "Call processed.",
        status: callData.subscriptionStatus,
        redirect: callData.dashboardLink,
        caller_type: callData.type
    });
};

/**
 * Creates a ticket in the logging DB. (Unchanged)
 */
exports.createTicket = async (req, res) => {
    // ... (Existing implementation of createTicket) ...
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
 * Fetches all address_line entries for a given user_id. (Unchanged)
 */
exports.getAddressByUserId = async (req, res) => {
    // ... (Existing implementation of getAddressByUserId) ...
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
 * Fetches the specific address_line for a given address_id. (Unchanged)
 */
exports.getAddressByAddressId = async (req, res) => {
    // ... (Existing implementation of getAddressByAddressId) ...
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
 * Fetches active servicemen who are interested in the specific service. (Unchanged)
 */
exports.getAvailableServicemen = async (req, res) => {
    // ... (Existing implementation of getAvailableServicemen) ...
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

// ======================================================================
// Dispatch Serviceman + Create Order (Modified for Resilience & Customer Name)
// ======================================================================

exports.dispatchServiceman = async (req, res) => {
    // ... (Existing implementation of dispatchServiceman) ...
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
        admin_id // ⬅️ NEW: Destructure admin_id from the request body
    } = dispatchData; 

    let customerUserId = null;
    let resolvedMemberId = member_id;
    let resolvedAddressId = address_id;
    let resolvedCustomerName = 'Unknown Customer'; // Initialize new variable

    if (!order_id || !user_id || !category || !ticket_id) {
        console.error(`⚠️ [ERROR] Missing essential dispatch data.`);
        console.groupEnd();
        return res.status(400).json({ message: 'Missing essential dispatch data.' });
    }
    
    // ⚠️ Add check for admin_id if it's a mandatory field
    if (!admin_id) {
        console.error("⚠️ [ERROR] Missing admin_id for dispatch record.");
        admin_id = 'UNKNOWN_ADMIN'; // Fallback if not mandatory
        console.warn(`[WARNING] Using fallback admin_id: ${admin_id}`);
    }

    try {
        // STEP 2: Lookup Customer Identifiers (Member ID and User ID)
        if (!resolvedMemberId && phone_number) {
            const dbPhoneNumber = phone_number.replace(/[^0-9]/g, '');

            const { data: allowedData, error: allowedError } = await supabase
                .from('AllowedNumber')
                .select('user_id, member_id')
                .eq('phone_number', dbPhoneNumber)
                .limit(1);

            if (allowedError || !allowedData || allowedData.length === 0) {
                console.error("❌ [MAIN DB LOOKUP ERROR] Customer not found via phone number.");
                customerUserId = null; // Set to null to indicate failure for subsequent main DB lookups
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
        
        // 🌟 NEW STEP: Fetch Customer Name
        if (customerUserId) {
            resolvedCustomerName = await fetchCustomerName(customerUserId, resolvedMemberId);
        }
        // ---------------------------------

        // Resolve Address ID (Only if we successfully found a customerUserId)
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
        
        // STEP 1: Insert into Employee DB (Dispatch Table)
        const employeeDbData = {
            order_id, 
            user_id, // Serviceman
            category,
            request_address,
            order_status: order_status || 'Assigned',
            order_request,
            phone_number,
            ticket_id,
            dispatched_at: new Date().toISOString(),
            customer_name: resolvedCustomerName,
            admin_id: admin_id // ⬅️ NEW: Adding admin_id to the dispatch table data
        };

        const { data: empData, error: empError } = await empSupabase
            .from('dispatch') 
            .insert([employeeDbData])
            .select('*');

        if (empError) {
            console.error("❌ [EMPLOYEE DB ERROR]", empError.message);
            console.groupEnd();
            return res.status(500).json({ message: 'Failed to insert into Dispatch table.' });
        }

        // STEP 3: Insert into Main DB (Order Table)
        const currentTimestamp = new Date().toISOString();
        const mainDbOrderData = {
            order_id: order_id,
            user_id: customerUserId, 
            member_id: resolvedMemberId, 
            address_id: resolvedAddressId,
            service_category: category,
            service_subcategory: category || 'General Service', 
            work_description: order_request, 
            order_status: 'Assigned',
            scheduled_date: currentTimestamp, 
            preferred_time: '9:00 AM - 1:00 PM', 
            created_at: currentTimestamp, 
            updated_at: currentTimestamp, 
        };

        const { error: orderError } = await supabase
            .from('Order') 
            .insert([mainDbOrderData]);

        if (orderError) {
            console.error("❌ [MAIN DB ORDER ERROR]", orderError.message);
            console.groupEnd();
            return res.status(500).json({ message: 'Serviceman dispatched, but Order record failed.', details: orderError.message });
        }

        console.log(`✅ [SUCCESS] Dispatch Complete for Customer: ${resolvedCustomerName}.`);
        console.groupEnd();
        res.status(201).json({
            message: 'Serviceman dispatched and Order created successfully.',
            dispatch_id: empData[0]?.id,
            order_id: order_id
        });

    } catch (e) {
        console.error("🛑 [EXCEPTION]", e.message);
        console.groupEnd();
        res.status(500).json({ message: 'Internal server error.' });
    }
};

// ======================================================================
// 🚀 NEW: ORDER MANAGEMENT (Assigned Orders & Cancellation) (Unchanged)
// ======================================================================

/**
 * 🚀 GET: Fetch all 'Assigned' orders for a specific member via phone number.
 * (Existing implementation of getAssignedOrders)
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
 * (Existing implementation of cancelOrder)
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
        const { data: mainData, error: mainError } = await supabase
            .from('Order')
            .update({ order_status: newStatus, updated_at: new Date().toISOString() })
            .eq('order_id', orderId)
            .select('order_id')
            .maybeSingle(); // Use maybeSingle to get null/error if no rows match

        if (mainError) {
            console.error("❌ Main DB Update Failed (DB Error):", mainError.message);
            return res.status(500).json({ message: "Failed to update Order status due to database error.", details: mainError.message });
        }
        
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
