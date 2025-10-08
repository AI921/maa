// client/app.js
import io from "https://cdn.socket.io/4.7.2/socket.io.esm.min.js";

const socket = io();

const joinBtn = document.getElementById("joinBtn");
const roomInput = document.getElementById("roomInput");
const nameInput = document.getElementById("nameInput");
const chatBox = document.getElementById("chatBox");
const messagesDiv = document.getElementById("messages");
const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");

const callControls = document.getElementById("callControls");
const callStatus = document.getElementById("callStatus");
const calleeName = document.getElementById("calleeName");
const callTimer = document.getElementById("callTimer");
const muteBtn = document.getElementById("muteBtn");
const hangupBtn = document.getElementById("hangupBtn");
const remoteAudio = document.getElementById("remoteAudio");

let username, room, peerConnection, localStream;
let callStartTime, timerInterval;

// Utility functions
function appendMessage(sender, text) {
  const div = document.createElement("div");
  div.classList.add("message");
  div.textContent = `${sender}: ${text}`;
  messagesDiv.appendChild(div);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function toggleCallUI(show, name = "") {
  if (show) {
    callControls.classList.remove("hidden");
    calleeName.textContent = name;
  } else {
    callControls.classList.add("hidden");
    clearInterval(timerInterval);
    callTimer.textContent = "00:00";
  }
}

function startTimer() {
  callStartTime = Date.now();
  timerInterval = setInterval(() => {
    const diff = Date.now() - callStartTime;
    const m = Math.floor(diff / 60000).toString().padStart(2, "0");
    const s = Math.floor((diff % 60000) / 1000).toString().padStart(2, "0");
    callTimer.textContent = `${m}:${s}`;
  }, 1000);
}

// Join room
joinBtn.onclick = async () => {
  room = roomInput.value.trim();
  username = nameInput.value.trim();
  if (!room || !username) return alert("Enter name & room");

  socket.emit("joinRoom", { room, username });
  chatBox.classList.remove("hidden");
  appendMessage("System", `You joined room "${room}"`);
};

// Chat messaging
sendBtn.onclick = () => {
  const msg = messageInput.value.trim();
  if (!msg) return;
  socket.emit("sendMessage", { room, username, message: msg });
  appendMessage("You", msg);
  messageInput.value = "";
};

// Receive message
socket.on("receiveMessage", (data) => {
  appendMessage(data.username, data.message);
});

// User joined
socket.on("userJoined", ({ username }) => {
  appendMessage("System", `${username} joined the room`);
});

// --------------- WebRTC logic ----------------
async function createPeerConnection() {
  const { TURN_URLS, TURN_USERNAME, TURN_PASSWORD } = await fetch("/turn-config").then((r) => r.json());
  const iceServers = TURN_URLS.split(",").map((url) => ({
    urls: url.trim(),
    username: TURN_USERNAME,
    credential: TURN_PASSWORD
  }));
  const pc = new RTCPeerConnection({ iceServers });

  pc.onicecandidate = (e) => {
    if (e.candidate) socket.emit("iceCandidate", { room, candidate: e.candidate });
  };

  pc.ontrack = (e) => (remoteAudio.srcObject = e.streams[0]);
  return pc;
}

// Mute/Unmute
muteBtn.onclick = () => {
  if (!localStream) return;
  const audioTrack = localStream.getAudioTracks()[0];
  audioTrack.enabled = !audioTrack.enabled;
  muteBtn.textContent = audioTrack.enabled ? "🔇" : "🔈";
};

// Hang up
hangupBtn.onclick = () => {
  if (peerConnection) peerConnection.close();
  toggleCallUI(false);
  socket.emit("endCall", room);
};

// Call end
socket.on("callEnded", () => {
  toggleCallUI(false);
});

// ---------------- Signaling -------------------
socket.on("offer", async ({ sdp, from }) => {
  peerConnection = await createPeerConnection();
  localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  localStream.getTracks().forEach((t) => peerConnection.addTrack(t, localStream));
  await peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);
  socket.emit("answer", { room, sdp: answer });
  toggleCallUI(true, "Caller");
  startTimer();
});

socket.on("answer", async ({ sdp }) => {
  await peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
  toggleCallUI(true, "Callee");
  startTimer();
});

socket.on("iceCandidate", async ({ candidate }) => {
  if (peerConnection) await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
});

// Start call manually (you can trigger this on button or condition)
window.startCall = async () => {
  peerConnection = await createPeerConnection();
  localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  localStream.getTracks().forEach((t) => peerConnection.addTrack(t, localStream));
  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  socket.emit("offer", { room, sdp: offer });
  toggleCallUI(true, "Connecting...");
};
