// callController.js

const admin = require('firebase-admin');
const { io } = require("../socket/socketHandler");

// ----------------------------------------------------------------------
// 🚨 IMPORTANT: FIREBASE INITIALIZATION FOR REALTIME DATABASE 🚨
// ----------------------------------------------------------------------

// 💡 FIX: Load credentials from the environment variable (best practice)
let serviceAccount;
try {
    if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
        throw new Error("FIREBASE_SERVICE_ACCOUNT environment variable is not set.");
    }
    // The JSON string from the environment variable is parsed here
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
} catch (e) {
    console.error("Failed to parse FIREBASE_SERVICE_ACCOUNT:", e.message);
    // If running locally without env vars, uncomment the hardcoded serviceAccount object below
    // serviceAccount = { /* Paste your full JSON content here for local development only */ }; 
    throw new Error("Firebase initialization failed due to credential error.");
}
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  // RTDB URL is correctly set here
  databaseURL: "https://call-subscription-default-rtdb.firebaseio.com/" 
});

const db = admin.database();

/**
 * Checks the subscription status of a phone number from the Firebase Realtime Database.
 * @param {string} phoneNumber - The incoming caller's phone number (e.g., "+91XXXXXXXXXX").
 */
const checkSubscriptionStatus = async (phoneNumber) => {
    // 💡 FIX 1: Normalize the phone number (remove '+' to match your RTDB node key format)
    const dbPhoneNumber = phoneNumber.replace('+', ''); 

    try {
        // RTDB QUERY: Reference the specific node in RTDB: /isActive/{normalizedNumber}
        const snapshot = await db.ref('isActive').child(dbPhoneNumber).once('value');

        if (snapshot.exists()) {
            // Subscription is active/verified
            const data = snapshot.val() || {};
            
            return {
                hasActiveSubscription: true,
                userName: data.name || "Verified Subscriber",
                subscriptionStatus: "Verified",
                // 💡 FIX 2: Use the normalized number for the dashboard link
                dashboardLink: `/user/dashboard/${dbPhoneNumber}`,
                ticket: data.lastActiveTicket || "Active Subscription"
            };
        } 
        
    } catch (error) {
        console.error("RTDB subscription check failed:", error.message);
    }

    // Default for new, unregistered, or inactive callers
    return {
        hasActiveSubscription: false,
        userName: "New/Non-Subscriber",
        subscriptionStatus: "None",
        // 💡 FIX 3: Use the normalized number for the search page link
        dashboardLink: `/new-call/search?caller=${dbPhoneNumber}`, 
        ticket: "New Call - No Ticket"
    };
};

/**
 * Main handler for the incoming call webhook.
 */
exports.getIncomingCall = async (req, res) => {
    // 1. Get the incoming call number (e.g., "+911234567890")
    const incomingNumber = req.body.From || req.query.From || req.body.caller || "+911234567890"; 
  
    // 2. Check the subscription status from Firebase
    const userData = await checkSubscriptionStatus(incomingNumber);
  
    const callData = {
        caller: incomingNumber,
        name: userData.userName,
        subscriptionStatus: userData.subscriptionStatus, // Will be "Verified" or "None"
        dashboardLink: userData.dashboardLink, // The redirection link
        ticket: userData.ticket,
        isExistingUser: userData.hasActiveSubscription
    };

    // 3. Notify the agent via Socket.IO
    const ioInstance = io();
    if (ioInstance) {
        // 💡 DEBUG LOG: This is the definitive status from your backend
        console.log(`[VERIFY DEBUG] Status: ${callData.subscriptionStatus}. Redirecting to: ${callData.dashboardLink}`);
        
        // Broadcast the call data to all connected agents
        ioInstance.emit("incoming-call", callData); 
    } else {
        console.warn("Socket.IO instance not available. Agent may not be notified.");
    }

    // 4. Send response back to the Voice Provider
    res.status(200).json({
        message: "Call processed, agent notified.",
        status: callData.subscriptionStatus,
        redirect: callData.dashboardLink
    });
};

