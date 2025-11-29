// src/utils/firebaseAdmin.js
const admin = require('firebase-admin');

const PROJECT_ID = "project-8812136035477954307";
const databaseURL = `https://${PROJECT_ID}-default-rtdb.firebaseio.com`;

let serviceAccount;

// --- CRITICAL: Load Key from Environment Variable ---
if (process.env.FIREBASE_ADMIN_KEY_JSON) {
    try {
        serviceAccount = JSON.parse(process.env.FIREBASE_ADMIN_KEY_JSON);

        // 💡 FIX: CLEAN AND RE-FORMAT THE PRIVATE KEY STRING
        // This ensures the PEM format is valid by replacing escaped '\n' 
        // characters that might have been corrupted/stripped by the deployment environment.
        if (serviceAccount.private_key) {
            // 1. Replace all literal '\n' characters (if they were incorrectly interpreted as actual line breaks)
            // 2. Remove any extra double quotes that might have been accidentally added around the key content
            serviceAccount.private_key = serviceAccount.private_key
                .replace(/\\n/g, '\n') // Replace the escaped newline with a real newline character
                .replace(/"/g, '');    // Remove any accidental quotes around the key itself
        }
        
        console.log("[FIREBASE ADMIN] Service Account loaded and private key formatted.");
    } catch (e) {
        console.error("[FIREBASE ADMIN ERROR] Failed to parse FIREBASE_ADMIN_KEY_JSON:", e.message);
        process.exit(1); 
    }
} else {
    console.error("[FIREBASE ADMIN ERROR] FIREBASE_ADMIN_KEY_JSON environment variable not found.");
    process.exit(1);
}

// --- Initialize Firebase Admin App ---
if (!admin.apps.length) {
    // This call requires the private_key field to be a valid PEM string
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: databaseURL
    });
    console.log("[FIREBASE ADMIN] App initialized successfully.");
}

const db = admin.database();
module.exports = { admin, db };
