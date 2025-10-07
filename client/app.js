const socket = io();
let username, receiver;

const loginBtn = document.getElementById("loginBtn");
const userSelect = document.getElementById("userSelect");
const chatDiv = document.querySelector(".chat");
const loginDiv = document.querySelector(".login");
const chatTitle = document.getElementById("chatTitle");
const chatBox = document.getElementById("chatBox");
const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const logoutBtn = document.getElementById("logoutBtn");
const typingIndicator = document.getElementById("typingIndicator");

let typingTimeout;

loginBtn.addEventListener("click", () => {
  username = userSelect.value;
  if (!username) return alert("Please select a user");

  receiver = username === "Ashish" ? "Maa" : "Ashish";
  socket.emit("login", username);

  loginDiv.style.display = "none";
  chatDiv.style.display = "block";
  chatTitle.textContent = `Chat with ${receiver}`;
});

logoutBtn.addEventListener("click", () => {
  location.reload();
});

sendBtn.addEventListener("click", () => {
  const message = messageInput.value.trim();
  if (!message) return;

  socket.emit("send_message", { sender: username, receiver, message });
  addMessage({ sender: username, message, time: new Date().toLocaleTimeString(), seen: false }, "you");
  messageInput.value = "";
});

socket.on("load_messages", (msgs) => {
  chatBox.innerHTML = "";
  msgs.forEach((m) => {
    const type = m.sender === username ? "you" : "other";
    addMessage(m, type);
  });
});

socket.on("receive_message", (msg) => {
  addMessage(msg, "other");
  socket.emit("message_seen", msg.sender);
});

socket.on("show_typing", ({ sender, isTyping }) => {
  if (isTyping) {
    typingIndicator.textContent = `${sender} is typing...`;
  } else {
    typingIndicator.textContent = "";
  }
});

messageInput.addEventListener("input", () => {
  socket.emit("typing", { sender: username, receiver, isTyping: true });
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    socket.emit("typing", { sender: username, receiver, isTyping: false });
  }, 1500);
});

function addMessage(msg, type) {
  const div = document.createElement("div");
  div.classList.add("message", type);
  div.innerHTML = `
    <span>${msg.message}</span>
    <div class="time">${msg.time} ${msg.seen ? "<span class='seen'>✔✔</span>" : ""}</div>
  `;
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
}
