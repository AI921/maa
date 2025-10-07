const socket = io();
let username = null;
let receiver = null;

const loginDiv = document.getElementById("loginDiv");
const chatDiv = document.getElementById("chatDiv");
const usernameSelect = document.getElementById("usernameSelect");
const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const messagesDiv = document.getElementById("messages");
const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const typingIndicator = document.getElementById("typingIndicator");
const chatWith = document.getElementById("chatWith");

loginBtn.addEventListener("click", () => {
  const selected = usernameSelect.value;
  if (!selected) return alert("Please select a user");
  username = selected;
  receiver = username === "ashish" ? "maa" : "ashish";
  chatWith.innerText = `Chat with ${receiver.charAt(0).toUpperCase() + receiver.slice(1)}`;
  socket.emit("login", username);
  loginDiv.style.display = "none";
  chatDiv.style.display = "flex";
});

logoutBtn.addEventListener("click", () => {
  window.location.reload();
});

sendBtn.addEventListener("click", sendMessage);
messageInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") sendMessage();
  else socket.emit("typing", { sender: username, receiver });
});

function sendMessage() {
  const msg = messageInput.value.trim();
  if (!msg) return;
  const newMsg = { sender: username, receiver, message: msg, time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) };
  addMessage(newMsg, "you", true);
  socket.emit("send_message", newMsg);
  messageInput.value = "";
}

function addMessage(msgObj, type, sentNow = false) {
  const div = document.createElement("div");
  div.classList.add("message", type);
  div.innerHTML = `
    <div>${msgObj.message}</div>
    <div class="timestamp">${msgObj.time} <span class="status">${sentNow ? "✔️" : msgObj.read ? "✅✅" : "✔️"}</span></div>
  `;
  messagesDiv.appendChild(div);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

socket.on("load_messages", (msgs) => {
  msgs.forEach((m) => addMessage(m, m.sender === username ? "you" : "other"));
});

socket.on("receive_message", (msg) => {
  addMessage(msg, "other");
  socket.emit("read_messages", username);
});

socket.on("typing", (sender) => {
  typingIndicator.innerText = `${sender} is typing...`;
  setTimeout(() => (typingIndicator.innerText = ""), 1500);
});
