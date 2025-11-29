// src/utils/firebaseAdmin.js
const admin = require('firebase-admin');

// 💡 Using the Project ID from your key to construct the URL
const PROJECT_ID = "project-8812136035477954307";
const databaseURL = `https://${PROJECT_ID}-default-rtdb.firebaseio.com`;

let serviceAccount;

// --- CRITICAL: Load Key from Environment Variable ---
if (process.env.FIREBASE_ADMIN_KEY_JSON) {
    try {
        // We must use JSON.parse() to convert the environment variable string 
        // back into a usable JavaScript object required by admin.credential.cert()
        serviceAccount = JSON.parse(process.env.FIREBASE_ADMIN_KEY_JSON);
        console.log("[FIREBASE ADMIN] Service Account loaded from environment variable.");
    } catch (e) {
        // If parsing fails (often due to formatting/escaping issues in the variable)
        console.error("[FIREBASE ADMIN ERROR] Failed to parse FIREBASE_ADMIN_KEY_JSON:", e.message);
        // Exiting the process makes the error visible on Render
        process.exit(1); 
    }
} else {
    // This warning suggests the environment variable was not set, which will cause failure.
    console.error("[FIREBASE ADMIN ERROR] FIREBASE_ADMIN_KEY_JSON environment variable not found. Firebase Admin SDK will not initialize correctly.");
    process.exit(1);
}

// --- Initialize Firebase Admin App ---
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: databaseURL
    });
    console.log("[FIREBASE ADMIN] App initialized successfully.");
}

const db = admin.database();
module.exports = { admin, db };
