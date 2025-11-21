const express = require("express");
const { getIncomingCall } = require("../controllers/callController");
const router = express.Router();

router.get("/incoming", getIncomingCall);

module.exports = router;
