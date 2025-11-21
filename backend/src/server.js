const http = require("http");
const app = require("./app");
const { setupSocket } = require("./socket/socketHandler");

const server = http.createServer(app);

setupSocket(server);

server.listen(5000, () => {
  console.log("Backend running on http://localhost:5000");
});


