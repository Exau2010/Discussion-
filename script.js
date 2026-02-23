const socket = io();

// ===== AUTH =====
if (!localStorage.getItem("user")) {
  window.location.href = "index.html"; // redirige si pas connecté
}

// afficher le nom
const user = localStorage.getItem("user");
document.getElementById("user").innerText = user;

// ===== LOGOUT =====
function logout() {
  localStorage.removeItem("user");
  window.location.href = "index.html";
}

// ===== Socket.IO =====
socket.emit("join", user);

// envoyer un message
const sendBtn = document.getElementById("sendBtn");
sendBtn.addEventListener("click", sendMessage);

// envoyer avec Entrée
const messageInput = document.getElementById("message");
messageInput.addEventListener("keyup", (e) => {
  if (e.key === "Enter") sendMessage();
});

function sendMessage() {
  const input = document.getElementById("message");
  if (!input.value) return;
  socket.emit("message", { to: "all", text: input.value });
  input.value = "";
}

// ===== Affichage messages =====
socket.on("history", msgs => msgs.forEach(showMessage));
socket.on("message", showMessage);

function showMessage(m) {
  const div = document.createElement("div");
  div.className = "message";
  div.innerText = m.from + " : " + m.text;
  document.getElementById("messages").appendChild(div);

  // scroller vers le bas
  const container = document.getElementById("messages");
  container.scrollTop = container.scrollHeight;
  }
