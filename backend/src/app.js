const express = require("express");
const cors = require("cors");

const agentRoutes = require("./routes/agentRoutes");
const callRoutes = require("./routes/callRoutes");
const webrtcRoutes = require("./routes/webrtcRoutes");

const app = express();
const corsOptions = {
    origin: [
        'http://localhost:3000',
        'http://localhost:5173', 
        'https://callcenter-frontend-o9od.onrender.com', // Your frontend URL
        // Add any other frontend URLs you use
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    optionsSuccessStatus: 200
};

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({
    origin: ['*','https://callcenter-frontend-o9od.onrender.com',], // Allow all origins (DEVELOPMENT ONLY)
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization','X-Agent-Id'],
    credentials: true
}));

app.use("/agent", agentRoutes);
app.use("/call", callRoutes);
app.use("/webrtc", webrtcRoutes);

module.exports = app;







