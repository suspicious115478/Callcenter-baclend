const express = require('express');
const router = express.Router();

// --- Mock Database Function ---
// Replace this function with your actual database query logic.
// This mock returns the successful data structure you reported.
const getUserDataFromDB = async (userId) => {
    // In a real application, you would use:
    // const { data, error } = await supaBaseClient.from('users').select('*').eq('id', userId);
    
    // Simulating database latency
    await new Promise(resolve => setTimeout(resolve, 50)); 

    // Return the successful data structure (using plan_status as seen in your logs)
    return {
        userId: userId,
        name: 'Akshita Gupta',
        phoneNumber: '+919876543210', // Assuming a mock phone number for display
        plan_status: 'active', // Key name matches your raw output
        addresses: [
            'Plot 12, Sector 6, Near Park',
            'Shop 5, Highstreet Mall',
            'Flat 201, Rosewood Apartments, MG Road, Mumbai Maharashtra 400001'
        ]
    };
};

// GET /user/data/:userId
// Endpoint to fetch specific user details for the dashboard
router.get("/data/:userId", async (req, res) => {
    const { userId } = req.params;
    
    // Basic validation
    if (!userId) {
        return res.status(400).json({ message: "User ID is required." });
    }

    try {
        const userData = await getUserDataFromDB(userId);
        
        if (!userData) {
            // If the database returns null or undefined
            return res.status(404).json({ message: `User with ID ${userId} not found.` });
        }

        // Return the data to the frontend
        return res.status(200).json(userData);

    } catch (error) {
        console.error("Error fetching user data:", error);
        // Return a generic 500 status for server errors
        return res.status(500).json({ message: "Internal server error during data retrieval." });
    }
});


module.exports = router;
