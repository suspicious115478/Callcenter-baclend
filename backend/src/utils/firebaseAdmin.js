// src/utils/firebaseAdmin.js
const admin = require('firebase-admin');

// 🛑 SECURITY RISK: Key is embedded directly. Use ENV variables in production.

// 1. Define the private key using a clean template literal
const rawPrivateKey = `-----BEGIN PRIVATE KEY-----
MIIEuwIBADANBgkqhkiG9w0BAQEFAASCBKUwggShAgEAAoIBAQDlz5HL0TRPF3RD
rCo61sLOQM1QXwlh/4DBb+TGpLQi9Kdo7r2N/9d4DJsMqzP1Xd4I8LOQM7Uw5pLp
BBmP8Pd8OJlvvCBsILl0W2pn73HPpKrJJjO7d6GP+CYQilB7IX9171enfdbL9VsH
FzGx23mYwYY+OyhYXFE/kWOpm2oZPFSUIcNlqFbq1PqaKTK/1OKM3mtXcSPH3NjM
Xx63Kynmd9qTjegueKWPQBtFXv3c/iRJKmJOM20EIQMSusioGcDWAMv/lIghZwGj
MfJkgh1zoKMPaxgAaLBx0GDETckw2pS0YvV3JjsJNmE9PLL4xr5YNW+4W3fRB+SQ
KlS2OMYBAgMBAAECgf97NQ21eDPTM3/hyCvb38gRTCzHKiydnZ4qFxNQbH0nQIOA
fn6h4shiVF/MKv1wTyL7KBEc/pvl27hntQr/YPFOaAnbHcFEN0c2WsxxbK5X5LCr
pw+VMk4sIZ5Gv+DmIs9zKx6TbaP7NU/YPVcnQ8OtYhPWyWCX/uaQbiJAjFIVtH6N
8L2m9jEgmohHSBXobkzP5N1z/5MslTyuvVxh6r9J3sP1WfWlXfwJnipXdGofaXMt
4jL+Vm52NHRxTlgaLCk5QenwxnMK1shY7Blyp61DOfWY88ABR+9m5Kadz9Ct9SMv
wY8Wi0HcUgrtSg5sKViIbGXJbuFlts+L555IbAECgYEA9CIKlv+hQh3DMDRh+lXD
09g8/ltzozMzmUW0IBK/L/qY+FMpN97iWeSsri0lHT4jF/IV/ZCa6meU7Xqb7+9k
W9FThKjwzjdH9tL3APE/apvLpdJlqcd/5cuf7nCrK22ex4a1Wtv98aJwPN04htAs
nsM0mvEDzwV/M5L9AtZtkMECgYEA8PtOHNZ+vtXYIzcHW3/zwj7Cq0mmt7+7mX5R
YjP9r9y64LTAPKw8/Qn6GbO/OnjxS5ZXTTA8yd0b3G4iCsl24qW0BEmyYw5r16OM
pTgILaJjQ4MhsXMjqESWAIfuSOltkifQlcR3YVxezaXPC5a1mdthBOHFZQf6FMIF
YHIjRUECgYEAmXW8imZuC42B4I9M93tp+YR38rux2OiaisJSE8c0/wfbmF1OD5y/
VBp2oZYnOlaQ4MCAKj/34VjzOMRVuWEWCNFwWneHx1jgl7rNIX6EipMcVEQJO8v4
DY8OHWgdcNMbd/ipj0+yNW4Sd2/n1HaPVc0HCE5wQnYGG3lOKbZ4cQECgYA9K828
TEaIMshWyBU6CNTbrgrEaEHFywnYANSv1PrEtYdKmxdhT2d75Bh0hcg5E5JM2bD3
ixMjOtljryE9E7718ZIstHhv5K1DY+TD2+FXlC0WaicXYF7gy+g34kl+gKKrwyeT
nPeg4029biWMj4kxsRqDnrv41XmJ42ZyAQcrAQKBgDbMQpxyn9OkT7lIliDGAPSU
zzwa+wLnE7dh1Pr2IOwrZ36TAVzvRJQTsmD61bKT8itidAlVR12golsCuz2C6xxE
obyheNQdIfDf4azhowtzyQN4K0UIoLQeL6UVBUhiD6/pO0WNmMkssH7vP2jLPh6l
czCyPxWoiledoka/VNoa
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
