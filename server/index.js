const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const fs = require("fs");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "../client")));

const messagesFile = path.join(__dirname, "messages.json");
let messages = fs.existsSync(messagesFile)
  ? JSON.parse(fs.readFileSync(messagesFile))
  : [];

function saveMessages() {
  fs.writeFileSync(messagesFile, JSON.stringify(messages, null, 2));
}

const users = {};

io.on("connection", (socket) => {
  socket.on("login", (username) => {
    users[username] = socket.id;
    console.log(`${username} logged in`);
    const userMessages = messages.filter(
      (m) =>
        (m.sender === username && m.receiver !== username) ||
        (m.receiver === username && m.sender !== username)
    );
    socket.emit("load_messages", userMessages);
  });

  socket.on("send_message", (data) => {
    const newMsg = {
      sender: data.sender,
      receiver: data.receiver,
      message: data.message,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      read: false,
    };
    messages.push(newMsg);
    saveMessages();

    const receiverSocket = users[data.receiver];
    if (receiverSocket) {
      io.to(receiverSocket).emit("receive_message", newMsg);
    }
  });

  socket.on("typing", (data) => {
    const receiverSocket = users[data.receiver];
    if (receiverSocket) io.to(receiverSocket).emit("typing", data.sender);
  });

  socket.on("read_messages", (reader) => {
  messages.forEach((m) => {
    if (m.receiver === reader) m.read = true;
  });
  saveMessages();
  io.emit("read_update", messages);
});


  socket.on("disconnect", () => {
    for (let name in users) if (users[name] === socket.id) delete users[name];
  });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () =>
  console.log(`✅ Server running on http://localhost:${PORT}`)
);
