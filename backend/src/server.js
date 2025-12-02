const http = require("http");
const app = require("./app");
const { setupSocket } = require("./socket/socketHandler");

const server = http.createServer(app);

setupSocket(server);
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});



