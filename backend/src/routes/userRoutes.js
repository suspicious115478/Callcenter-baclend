const express = require('express');
const router = express.Router();

// 🚨 STEP 1: Import the controller that contains the actual data fetching logic.
// Assuming your 'callController.js' is in a 'controllers' directory, 
// adjust the path if necessary (e.g., if it's in the same directory, use './callController').
const callController = require('../controllers/callController'); 

// GET /user/data/:userId
// This route now uses the getDashboardData function you defined in your call controller,
// which already handles the Supabase queries and response formatting.
router.get("/data/:userId", callController.getDashboardData);


module.exports = router;
