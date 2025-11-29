// src/utils/firebaseAdmin.js
const admin = require('firebase-admin');

// ⚠️ IMPORTANT: Replace this with the path to your Firebase service account key file
// You can download this file from your Firebase Project Settings -> Service Accounts
const serviceAccount = require('./path-to-your-serviceAccountKey.json'); 

// ⚠️ IMPORTANT: Replace this with your Realtime Database URL
const databaseURL = 'https://YOUR-FIREBASE-PROJECT-ID-default-rtdb.firebaseio.com';

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: databaseURL
    });
}

const db = admin.database();

module.exports = { admin, db };
