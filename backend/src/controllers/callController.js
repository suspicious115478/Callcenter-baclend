// callController.js

const admin = require('firebase-admin');
const { io } = require("../socket/socketHandler");

// ----------------------------------------------------------------------
// FIREBASE INITIALIZATION 
// (Assume environment variable setup from previous steps is correct)
// ----------------------------------------------------------------------

let serviceAccount;
try {
    if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
        throw new Error("FIREBASE_SERVICE_ACCOUNT environment variable is not set.");
    }
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
} catch (e) {
    console.error("Failed to parse FIREBASE_SERVICE_ACCOUNT:", e.message);
    throw new Error("Firebase initialization failed due to credential error.");
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://call-subscription-default-rtdb.firebaseio.com/" 
});

const db = admin.database();

/**
 * Checks the subscription status of a phone number from the Firebase Realtime Database.
 * 🚨 CHANGE: Export this function so socketHandler can use it.
 */
exports.checkSubscriptionStatus = async (phoneNumber) => {
    // Normalize the phone number
    const dbPhoneNumber = phoneNumber.replace('+', ''); 

    try {
        const snapshot = await db.ref('isActive').child(dbPhoneNumber).once('value');

        if (snapshot.exists()) {
            const data = snapshot.val() || {};
            
            return {
                hasActiveSubscription: true,
                userName: data.name || "Verified Subscriber",
                subscriptionStatus: "Verified",
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
        dashboardLink: `/new-call/search?caller=${dbPhoneNumber}`, 
        ticket: "New Call - No Ticket"
    };
};

/**
 * Main handler for the incoming call webhook.
 */
exports.getIncomingCall = async (req, res) => {
    // This function remains the main webhook handler, using the exported checker
    const incomingNumber = req.body.From || req.query.From || req.body.caller || "+911234567890"; 
  
    const userData = await exports.checkSubscriptionStatus(incomingNumber);
  
    // ... (rest of the logic, including the socket emit, remains the same) ...
    // Note: Use userData.dashboardLink in your socket emit.
    
    const callData = {
        caller: incomingNumber,
        name: userData.userName,
        subscriptionStatus: userData.subscriptionStatus,
        dashboardLink: userData.dashboardLink,
        ticket: userData.ticket,
        isExistingUser: userData.hasActiveSubscription
    };
    
    // ... rest of the socket emit and res.json ...
    const ioInstance = io();
    if (ioInstance) {
        console.log(`[VERIFY DEBUG] Status: ${callData.subscriptionStatus}. Redirecting to: ${callData.dashboardLink}`);
        ioInstance.emit("incoming-call", callData);
    }
    
    res.status(200).json({
        message: "Call processed, agent notified.",
        status: callData.subscriptionStatus,
        redirect: callData.dashboardLink
    });
};
