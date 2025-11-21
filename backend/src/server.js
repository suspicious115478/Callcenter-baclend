const http = require("http");
const app = require("./src/app");
const { setupSocket } = require("./src/socket/socketHandler");

const server = http.createServer(app);

setupSocket(server);

server.listen(5000, () => {
  console.log("Backend running on http://localhost:5000");
});
