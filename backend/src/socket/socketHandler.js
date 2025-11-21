const { Server } = require("socket.io");

let ioInstance;

exports.setupSocket = (server) => {
  const io = new Server(server, {
    cors: { origin: "*" }
  });

  ioInstance = io;

  io.on("connection", (socket) => {
    console.log("Agent connected:", socket.id);

    setInterval(() => {
      socket.emit("incoming-call", {
        caller: "+919876543210",
        name: "John Doe (TEST)",
        // Add the required fields for frontend testing
        subscriptionStatus: "None", 
        dashboardLink: "/new-call/search?caller=+919876543210", 
        ticket: "No open tickets"
      });
    }, 30000);
  });
};

exports.io = () => ioInstance;

