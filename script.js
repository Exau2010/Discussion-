const socket = io();

/* ===== AUTH ===== */
async function register() {
  const username = document.getElementById("pseudo").value;
  const password = document.getElementById("password").value;

  if (!username || !password) return alert("Veuillez remplir tous les champs");

  const res = await fetch("/api/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });

  const data = await res.json();
  alert(data.error || "Compte créé, connecte-toi");
}

async function login() {
  const username = document.getElementById("pseudo").value;
  const password = document.getElementById("password").value;

  if (!username || !password) return alert("Veuillez remplir tous les champs");

  const res = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });

  const data = await res.json();
  if (data.error) return alert(data.error);

  localStorage.setItem("user", data.username);
  window.location.href = "chat.html";
}

/* ===== CHAT ===== */
if (document.getElementById("user")) {
  const user = localStorage.getItem("user") || "Invité";
  document.getElementById("user").innerText = user;
}

function sendMessage() {
  const input = document.getElementById("message");
  if (!input.value) return;

  const user = localStorage.getItem("user") || "Invité";
  socket.emit("message", { user, text: input.value });
  input.value = "";
}

function logout() {
  const user = localStorage.getItem("user");
  if (user) {
    socket.emit("disconnectUser");
  }
  localStorage.removeItem("user");
  window.location.href = "index.html";
}

// Affichage des messages
socket.on("history", msgs => msgs.forEach(showMessage));
socket.on("message", showMessage);

function showMessage(m) {
  const div = document.createElement("div");
  div.className = "message";
  div.innerText = m.user + " : " + m.text;
  document.getElementById("messages").appendChild(div);
  document.getElementById("messages").scrollTop = document.getElementById("messages").scrollHeight;
}
