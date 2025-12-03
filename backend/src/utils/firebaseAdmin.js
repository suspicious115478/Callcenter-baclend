// src/utils/firebaseAdmin.js
const admin = require('firebase-admin');

// 🛑 SECURITY RISK: Key is embedded directly. Use ENV variables in production.

// 1. Define the private key using a clean template literal
const rawPrivateKey = `-----BEGIN PRIVATE KEY-----
MIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQCf+kqjmGFNXSug
JdTRB/HHcrm8kqLWB7exWaGzgDH/keFVV75KtpB3eZlgJDlWPrWJ8fat5tbKq/+L
Z9UGjppm5xZQBES9y79sMMJdDce1aMLqwreoTKNVDUpRqhyy5zYGpu8Pahccjpxb
0kwE761aYA7bMCsr7gzNhbmVY+8KJOdQFVDqCIoWCY1GLUbueyZEfIc6BBc1y4bo
TSC2x7+sNqRCatLuhNvPXnoADGfx47cZo9xFYEMhNoLhQ9PsSHFjCACI6lV0UWG3
dAqGFDpWvsj4k/SiAeuuptkdxhJ5y7Ls2s9WptTXToUleqOyQFCjqvxwdXvHj/gu
T8UJpzZPAgMBAAECggEANcc+9hXQh+BNPQ3ap9ZC2ehgNdsZcFex0aWu7ReoNyDE
Hhtb9eO/VtqCy8YBnFOCVXgIk9co14LQaf2iqAyiLPt8DbQRo7fthqIxhHSQcRRh
ieehM6tnsLzCAgfsk9uT1tKhRI5GbKwoNdnRAkvL+7iU5ewgZykkFqbghy7L+Z18
IDTL1KFMqhfGfHOIMpFqcyBXntGugab/SuUhhUx99AiPyX+6hnNhZsyu0Lvnq+OX
KN6YG4/0lcd6f4I52bmXHWzjZLKo6nEgXY8w4KMUqih6dnaw6rpUhXfu2eSwevEG
77+nTQfgQ6OgCxCVlUZpXfSp8jFsxYyX+34sZqptMQKBgQDQ0UewqKJKOt8B8qxT
u8XHWWgDxzArObVkoQ6UR9XCg1am/LYdGYtpzDMlgkJomr2SmqU9XBxD7LN9SLW9
oKCQZJP+rlc8v0kpSr6BCXNXBI5+R670vqvHRQoOz6tB2BuKuqDDXSrXpyE2cM+T
rip9HGQ2+0LZZmg72+BwsGQohwKBgQDEH/M9TmmLzMCWIVEXYa5UL82ceeOmyKaJ
QYLAyb5kqhhKT+b6Y0YdozXcuxxpzh9+0Brhfe5YH9bPdWJwMDdCgjxErG5V2bFU
D4WfbWgh505qSVLiqK0Im7ZrlLmKKR/0UMfMZ76Od4lgVjykUtKHB55vBLNKjlFg
IMTsbted+QKBgHbjgH6bNHMw24Ffai/uS6e5RphIEyu5GoalkAhqcdDiODaw0Pr2
bUKaKVCkviySVXafp46s38bogDTHbfn99wzexsgM+Mw0WHIzBQ2wlMOpa3uIUpsz
59d3fkd6gxXk9aFhqmAwrlDD7gvx5K0/Tx+WR5RqL+BZBuV1xW5Db3MHAoGAAh8q
XX5sq+OCLd2cZ/lZjnWZ7thuuw4upwt7Y6SLF8GzU5J7uDe8uXNbkNDBZO+i7ZdI
wym+m1t00ne9oeMTpfeMuV14MBuTzIoCcxAW8U70TTgP2n3iqVYt6goI29LIEreR
AcgZiqcGaHFmZIy01FsjvqW5XtQdU0Hnf3tPf9kCgYAJAZx3hSNUgul/iYmRBqG9
Xm7j9Jh80734UuqkoQdn1KeHLlWEHyfkI/wUb74Fdleu9TD0fQ+vw3MXxuLUBy5S
3eg6pDc8a5LFNGyg5NsMuxV8OSmZBj8Ex+slUIaNvrfXbZed73O+KxkxblRMDcP0
dA32Yeyl+9Ww94coWe5xNg==
-----END PRIVATE KEY-----`;


const serviceAccountKey = {
    "type": "service_account",
    "project_id": "project-8812136035477954307",
    "private_key_id": "052c66c9345994dac2ab69e494167cc8dbcac472",
    "private_key": rawPrivateKey, // Use the cleaned string
    "client_email": "firebase-adminsdk-fbsvc@project-8812136035477954307.iam.gserviceaccount.com",
    "client_id": "102286591606476992488",
    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
    "token_uri": "https://oauth2.googleapis.com/token",
    "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
    "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-fbsvc%40project-8812136035477954307.iam.gserviceaccount.com",
    "universe_domain": "googleapis.com"
};


const PROJECT_ID = "project-8812136035477954307";
const databaseURL = `https://${PROJECT_ID}-default-rtdb.firebaseio.com`;

// --- Initialize Firebase Admin App ---
if (!admin.apps.length) {
    console.log("[FIREBASE ADMIN] Attempting initialization with embedded key...");
    
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccountKey),
        databaseURL: databaseURL
    });
    
    console.log("[FIREBASE ADMIN] App initialized successfully.");
}

const db = admin.database();
module.exports = { admin, db };
