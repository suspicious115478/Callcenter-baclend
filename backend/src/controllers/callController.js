// callController.js

const admin = require('firebase-admin');
const { io } = require("../socket/socketHandler");

// ----------------------------------------------------------------------
// 🚨 IMPORTANT: FIREBASE INITIALIZATION FOR REALTIME DATABASE 🚨
// ----------------------------------------------------------------------

const serviceAccount = {
  "type": "service_account",
  "project_id": "call-subscription",
  "private_key_id": "d5cdf006197807e2069fe36cc26154082ba6a1c2",
  // The private key is truncated here for display but the full key is used internally.
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDhODHT4Xmwe4z/\nirQgBSw6FTpMyAkLQhGFTwez4/BOKgsRJXENRfSg9gxVzO8n61CjblVcTTWWNBed\nI+WoQ/Lwh2dedNNXVi+wvb5FRiotqBuGJiPuhuaETi1HXfOeswCzOmDCafaOhxmd\nULDN4A7XO8tX5AtxltimVVVkv0GbV4sQ10fq+Sf82DuXM8TE4QzwVGx8V9sgqOjm\nJrLOr/gHRZbMiWABZ6q0xPoeoEV8AZOzGnYWq36jmfpO5veo5gBAD7gLwSXFKfoT\n5UM2/SyuObXfqRcz1XSJScyrKe9jQNKT8MHeHwZJYtejkCp3Do2gJxr9f01gXMSo\nxxh43yFBAgMBAAECggEALAvCau6wztwK4jstKQn58U4Pfc6tPh9or8qZ9guBBrhg\nO7U32+Gviv8zwF/48bSqq5u7Y/bRoROE/r1zf6nyTCofBDES2ATKBOXG3WNwgkdb\nQqwY4OBPGtbzMf7k00esvmCPZdY1WwB++O479bd5D4zpIsI9nrRioH0V20MwQIHL\naQnqFW6GoxkjbEEe1Rwgw0EiU5B05YF2oMFcogwMeNOyDJJVfkHNc8NJgLcVwTyo\n+q1TiTnIMPDzEirFElnAOIBWGDZYcoWiKIjkeCNZhPs4ciNrMmF8RYzT3p2mGvGO\nNJdRBIqiM85SuxkYi/Pvv7/kbpKHjSUBnRGpA1ZPsQKBgQD9ci/5BO+ZqwB87xtn\ndDbC3PBdWd+ZGMYt56aWi3KA6RuoKJnhlahN7I/mWT6D5V6zhfRbAGiErs45svku\nDic90Yk766sv9GvAJSmMIT30YRlHveP8SfzXgaLrzaYay/gHom+lqrBPjI6pKG3E\n4YBKJNXie+A0mQCuWR+DQmkZdQKBgQDjfTEF2UMZH3RENh2dpSJAqR0znLtR1KBl\nV/Ec0FGwJQLoEFLrpN2gx8sIYtdKa5XJ609oHRYRVKpvttYYHid4EMI7zL9m6Gj3\nRxhKycV/mZcfv7Pw9ATckJaIHUKK79p/Co+E0yW3RKNQ07NAZILdXRWn/S2a5HhL\nZi3iAsNjHQKBgDCFov+W3VRbM723fVSiIDXQXMhSg4dpAdAaEH+z9NkPR/c6xrM0\nlsNMbgRYw6o2yJmwJKcjfd8hJGRRinkxxnuEWTS6msyUi+h+dOTaHGVkDZX5meNc\nOub7b7ibZ5irwjGb/KoH8rdYHpvuHI3b6lbHlJdGxhbr0ACRGYJkvYBdAoGBAMoo\nE2tuIdlugUSojnLsL18kqaWW70ON3yeQGd0QJreQfF+7OeTcMnNReNSv+T/SEV9J\nc9xClLy772WtJd5y1YI16lV34tNRTw4HqMe1PIPi+lAlbIOAZd2Xw52b2ulasmFZ\nAib3+Dk/jp4iMtXTPBP5R2hsbZ2K0He4iqeg6v7lAoGBAONUtTWuCmfhOFvylwUW\nHatd5Ye9hp262YfhOSsyp1y4ZlcSrbJBCBWBmHlQRvlj0auNaUHn7BKP5hjAmssm\ndPJDG9kccVnmXuxw77rA/4djcb+fmMjd0ocSlS8Bt6azzYhyfNrqRab1eiW9ZwZS\n3+cOt89wPH9c82co3P0TJJoi\n-----END PRIVATE KEY-----\n",
  "client_email": "firebase-adminsdk-fbsvc@call-subscription.iam.gserviceaccount.com",
  "client_id": "114212045403508351202",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-fbsvc%40call-subscription.iam.gserviceaccount.com",
  "universe_domain": "googleapis.com"
};

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  // 🔴 IMPORTANT: You MUST set your Realtime Database URL here!
  databaseURL: "https://call-subscription-default-rtdb.firebaseio.com/" 
});

// 🟢 Use admin.database() for Realtime Database
const db = admin.database();
// ----------------------------------------------------------------------

/**
 * Checks the subscription status of a phone number from the Firebase Realtime Database.
 * Assumes RTDB structure: /isActive/{phoneNumber_without_plus_sign}
 * @param {string} phoneNumber - The incoming caller's phone number (e.g., "+91XXXXXXXXXX").
 */
const checkSubscriptionStatus = async (phoneNumber) => {
    try {
        // 🟢 FIX: Normalize the phone number (remove '+' to match your RTDB node key format)
        const dbPhoneNumber = phoneNumber.replace('+', ''); 

        // 🟢 RTDB QUERY: Reference the specific node in RTDB: /isActive/{normalizedNumber}
        const snapshot = await db.ref('isActive').child(dbPhoneNumber).once('value');

        if (snapshot.exists()) {
            // Subscription is active/verified
            const data = snapshot.val() || {};
            
            return {
                hasActiveSubscription: true,
                userName: data.name || "Verified Subscriber",
                subscriptionStatus: "Verified",
                dashboardLink: `/user/dashboard/${phoneNumber}`, // Redirect to user dashboard
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
        dashboardLink: `/new-call/search?caller=${phoneNumber}`, // Redirect to new call/search page
        ticket: "New Call - No Ticket"
    };
};

/**
 * Main handler for the incoming call webhook.
 * This function will be called by your Voice Provider (Twilio/Vonage/etc.).
 */
exports.getIncomingCall = async (req, res) => {
    // 1. Get the incoming call number 
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
        console.log(`Emitting 'incoming-call' for caller: ${callData.caller} with status: ${callData.subscriptionStatus}.`);
        
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

