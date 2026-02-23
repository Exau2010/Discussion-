const socket = io();
const user = localStorage.getItem("user");
if (user) socket.emit("join", user);

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
  window.location.href = "home.html";
}

function logout() {
  localStorage.removeItem("user");
  window.location.href = "index.html";
}

// ===== CHAT =====
function sendMessage() {
  const input = document.getElementById("message");
  const to = document.getElementById("chatWith")?.value || "";
  if (!input.value) return;
  socket.emit("message", { to, text: input.value });
  input.value = "";
}

socket.on("history", msgs => {
  const box = document.getElementById("messages");
  if (!box) return;
  box.innerHTML = "";
  msgs.forEach(m => {
    const div = document.createElement("div");
    div.innerText = `${m.from} → ${m.to}: ${m.text}`;
    box.appendChild(div);
  });
});

socket.on("newMessage", msg => {
  alert(`Nouveau message de ${msg.from}: ${msg.text}`);
});

socket.on("messageSent", msg => {
  const box = document.getElementById("messages");
  if (!box) return;
  const div = document.createElement("div");
  div.innerText = `${msg.from} → ${msg.to}: ${msg.text}`;
  box.appendChild(div);
});

// ===== UTILISATEURS =====
socket.on("users", users => {
  const list = document.getElementById("users");
  if (!list) return;
  list.innerHTML = "";
  users.forEach(u => {
    const div = document.createElement("div");
    div.innerText = `${u.username} ${u.online ? "🟢" : "⚪"}`;
    list.appendChild(div);
  });
});

// ===== DEMANDES D'AMIS =====
function sendFriendRequest(to) { socket.emit("friendRequest", { to }); }
socket.on("friendRequests", requests => {
  const div = document.getElementById("friendRequests");
  if (!div) return;
  requests.forEach(r => {
    const p = document.createElement("p");
    p.innerHTML = `${r.from} t'a envoyé une demande <button onclick="respondFriend('${r._id}', true)">Accepter</button> <button onclick="respondFriend('${r._id}', false)">Refuser</button>`;
    div.appendChild(p);
  });
});
function respondFriend(id, accept) { socket.emit("friendResponse", { id, accept }); }

// ===== RECHERCHE =====
async function searchUser() {
  const q = document.getElementById("searchInput").value;
  const res = await fetch(`/api/search?q=${q}`);
  const users = await res.json();
  const div = document.getElementById("searchResults");
  div.innerHTML = "";
  users.forEach(u => {
    const p = document.createElement("p");
    p.innerHTML = `<a href="user.html?username=${u.username}">${u.username} ${u.online ? "🟢" : "⚪"}</a>`;
    div.appendChild(p);
  });
    }
