// src/controllers/logController.js

const { createClient } = require('@supabase/supabase-js');

// ----------------------------------------------------------------------
// SUPABASE INITIALIZATION (LOGGING DB - The Second Instance)
// ----------------------------------------------------------------------

// 🚨 CRITICAL UPDATE: Using LOG_ prefixes to connect to the dedicated logging DB
const SUPABASE_URL = process.env.LOG_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.LOG_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Missing Logging Supabase credentials (LOG_SUPABASE_URL/KEY).");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * API Handler: POST /api/logs/save
 * Saves a new request log to the 'request_logs' table in the LOGGING DB.
 */
exports.saveRequestLog = async (req, res) => {
    const { phone, category, notes, agentName } = req.body;

    // Basic Validation
    if (!phone || !notes) {
        return res.status(400).json({ success: false, message: "Phone number and notes are required." });
    }

    console.log(`[LOG SAVE] Saving note for ${phone} [${category}] using LOGGING DB...`);

    try {
        const { data, error } = await supabase
            .from('request_logs') // Ensure this table exists in your Logging Supabase
            .insert([
                { 
                    phone: phone, 
                    category: category, 
                    notes: notes,
                    agent_name: agentName || 'System' 
                }
            ])
            .select();

        if (error) {
            console.error("Supabase Insert Error (Logging DB):", error.message);
            return res.status(500).json({ success: false, message: "Database insertion failed." });
        }

        console.log("[LOG SAVE SUCCESS] Record created in Logging DB:", data);
        return res.status(200).json({ success: true, message: "Log saved successfully", data });

    } catch (e) {
        console.error("Log Controller Exception:", e.message);
        return res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};
