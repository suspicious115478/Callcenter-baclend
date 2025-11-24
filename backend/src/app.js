const express = require("express");
const cors = require("cors");

const agentRoutes = require("./routes/agentRoutes");
const callRoutes = require("./routes/callRoutes");
const webrtcRoutes = require("./routes/webrtcRoutes");
const logRoutes = require("./routes/logRoutes"); 
const app = express();
app.use(express.json());
app.use(cors());

app.use("/agent", agentRoutes);
app.use("/call", callRoutes);
app.use("/webrtc", webrtcRoutes);
app.use("/api/logs", logRoutes); 

module.exports = app;



