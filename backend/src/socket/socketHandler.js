// sockethandler.js

const { Server } = require("socket.io");

let ioInstance;

exports.setupSocket = (server) => {
  const io = new Server(server, {
    cors: { origin: "*" }
  });

  ioInstance = io;

  io.on("connection", (socket) => {
    console.log("Agent connected:", socket.id);
    // 🚨 REMOVED: The setInterval loop that was sending dummy calls.
    // Calls will now ONLY be emitted from the callController webhook.
  });
};

exports.io = () => ioInstance;
