const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const fs = require("fs");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const CLIENT_PATH = path.join(__dirname, "../client");
app.use(express.static(CLIENT_PATH));

const messagesFile = path.join(__dirname, "messages.json");
let users = {};
let messages = [];

if (fs.existsSync(messagesFile)) {
  messages = JSON.parse(fs.readFileSync(messagesFile));
}

function saveMessages() {
  fs.writeFileSync(messagesFile, JSON.stringify(messages, null, 2));
}

io.on("connection", (socket) => {
  console.log("User connected");

  socket.on("login", (username) => {
    users[username] = socket.id;
    console.log(`${username} logged in`);
    socket.emit("load_messages", messages);
  });

  socket.on("send_message", (data) => {
    const { sender, receiver, message } = data;
    const newMsg = {
      sender,
      receiver,
      message,
      time: new Date().toLocaleTimeString(),
      seen: false,
    };
    messages.push(newMsg);
    saveMessages();
    const receiverSocket = users[receiver];
    if (receiverSocket) {
      io.to(receiverSocket).emit("receive_message", newMsg);
    }
  });

  socket.on("message_seen", (sender) => {
    messages.forEach((msg) => {
      if (msg.sender === sender) msg.seen = true;
    });
    saveMessages();
  });

  socket.on("typing", (data) => {
    const { sender, receiver, isTyping } = data;
    const receiverSocket = users[receiver];
    if (receiverSocket) {
      io.to(receiverSocket).emit("show_typing", { sender, isTyping });
    }
  });

  socket.on("disconnect", () => {
    for (const name in users) {
      if (users[name] === socket.id) delete users[name];
    }
    console.log("User disconnected");
  });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () =>
  console.log(`✅ Server running on http://localhost:${PORT}`)
);
