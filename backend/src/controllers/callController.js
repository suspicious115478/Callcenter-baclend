// callController.js

const admin = require('firebase-admin');
// 🚨 CRITICAL FIX 1: REMOVE the direct import of the socket handler to break the circular dependency.
// const { io } = require("../socket/socketHandler"); 

// ----------------------------------------------------------------------
// FIREBASE INITIALIZATION 
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
 * This function is exported for use in the socketHandler for testing.
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
 * 🚨 CRITICAL FIX 2: This function now accepts the io getter as an argument and returns the Express handler.
 */
exports.getIncomingCall = (ioInstanceGetter) => async (req, res) => {
    // This function remains the main webhook handler, using the exported checker
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
    
    // 🚨 CRITICAL FIX 3: Get the instance using the injected getter function
    const ioInstance = ioInstanceGetter();
    if (ioInstance) {
        console.log(`[VERIFY DEBUG] Status: ${callData.subscriptionStatus}. Redirecting to: ${callData.dashboardLink}`);
        ioInstance.emit("incoming-call", callData);
    } else {
        console.warn("Socket.IO instance not available via getter.");
    }
    
    res.status(200).json({
        message: "Call processed, agent notified.",
        status: callData.subscriptionStatus,
        redirect: callData.dashboardLink
    });
};
