// src/utils/logSupabaseClient.js
const { createClient } = require('@supabase/supabase-js');

// Ensure these environment variables are available on Render
const supabaseUrl = process.env.LOG_SUPABASE_URL;
const supabaseAnonKey = process.env.LOG_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.error("LOG_SUPABASE_URL or LOG_SUPABASE_ANON_KEY is not set.");
    // throw new Error("Supabase logging credentials missing."); // May stop server startup
}

const logSupabase = createClient(supabaseUrl, supabaseAnonKey);

module.exports = logSupabase;
