// src/controllers/logController.js

const { createClient } = require('@supabase/supabase-js');

// Supabase Setup
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Missing Supabase credentials.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * API Handler: POST /api/logs/save
 * Saves a new request log to the 'request_logs' table.
 */
exports.saveRequestLog = async (req, res) => {
    const { phone, category, notes, agentName } = req.body;

    // Basic Validation
    if (!phone || !notes) {
        return res.status(400).json({ success: false, message: "Phone number and notes are required." });
    }

    console.log(`[LOG SAVE] Saving note for ${phone} [${category}]`);

    try {
        const { data, error } = await supabase
            .from('request_logs') // Ensure this table exists in Supabase
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
            console.error("Supabase Insert Error:", error.message);
            return res.status(500).json({ success: false, message: "Database insertion failed." });
        }

        console.log("[LOG SAVE SUCCESS] Record created:", data);
        return res.status(200).json({ success: true, message: "Log saved successfully", data });

    } catch (e) {
        console.error("Log Controller Exception:", e.message);
        return res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};