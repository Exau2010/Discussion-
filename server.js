const socket = io();

// ===== AUTH =====
async function login() {
  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;
  const res = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });
  const data = await res.json();
  if (data.error) return alert(data.error);
  localStorage.setItem("user", username);
  window.location.href = "chat.html";
}

async function register() {
  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;
  if (!username || !password) return alert("Remplis tous les champs !");
  const res = await fetch("/api/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });
  const data = await res.json();
  if (data.error) return alert(data.error);
  alert("Compte créé ! Tu peux maintenant te connecter.");
  window.location.href = "index.html";
}

// ===== LOGOUT =====
function logout() {
  localStorage.removeItem("user");
  window.location.href = "index.html";
}

// ===== CHAT =====
if (document.getElementById("user")) {
  const user = localStorage.getItem("user");
  document.getElementById("user").innerText = user;
  socket.emit("join", user);
}

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
                          }
