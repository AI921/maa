// server/index.js
import express from "express";
import http from "http";
import { Server } from "socket.io";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 10000;

// Serve static files (your client)
app.use(express.static(path.join(__dirname, "../client")));

// TURN configuration (optional, for reliability)
const TURN_URLS = process.env.TURN_URLS || "stun:stun.l.google.com:19302";
const TURN_USERNAME = process.env.TURN_USERNAME || "";
const TURN_PASSWORD = process.env.TURN_PASSWORD || "";

// Send TURN config to client
app.get("/turn-config", (req, res) => {
  res.json({ TURN_URLS, TURN_USERNAME, TURN_PASSWORD });
});

// -------------------- SOCKET.IO --------------------
const users = {}; // socket.id → username
const rooms = {}; // roomName → [socket.id, socket.id]

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("joinRoom", ({ room, username }) => {
    users[socket.id] = username;
    socket.join(room);
    if (!rooms[room]) rooms[room] = [];
    rooms[room].push(socket.id);

    console.log(`${username} joined room ${room}`);

    socket.to(room).emit("userJoined", { username });
  });

  // Chat message
  socket.on("sendMessage", ({ room, username, message }) => {
    io.to(room).emit("receiveMessage", { username, message });
  });

  // --- WebRTC signaling ---
  socket.on("offer", (data) => {
    socket.to(data.room).emit("offer", { sdp: data.sdp, from: socket.id });
  });

  socket.on("answer", (data) => {
    socket.to(data.room).emit("answer", { sdp: data.sdp });
  });

  socket.on("iceCandidate", (data) => {
    socket.to(data.room).emit("iceCandidate", { candidate: data.candidate });
  });

  socket.on("endCall", (room) => {
    socket.to(room).emit("callEnded");
  });

  socket.on("disconnect", () => {
    const username = users[socket.id];
    console.log("User disconnected:", username);
    delete users[socket.id];

    for (const room in rooms) {
      rooms[room] = rooms[room].filter((id) => id !== socket.id);
    }
  });
});

// ---------------------------------------------------
server.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
