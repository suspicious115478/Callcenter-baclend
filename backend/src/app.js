const express = require("express");
const cors = require("cors");

const agentRoutes = require("./routes/agentRoutes");
const callRoutes = require("./routes/callRoutes");
const webrtcRoutes = require("./routes/webrtcRoutes");

const app = express();
app.use(express.json());
app.use(cors());

app.use("/agent", agentRoutes);
app.use("/call", callRoutes);
app.use("/webrtc", webrtcRoutes);

module.exports = app;


