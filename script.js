const socket = io();
const user = localStorage.getItem("user");

// Redirection si non connecté
if (!user) location.href = "index.html";

if (document.getElementById("toUser")) {
  const toUser = localStorage.getItem("toUser");
  document.getElementById("toUser").innerText = toUser;

  socket.emit("join", user);
  socket.emit("getHistory", { user, toUser });

  const msgInput = document.getElementById("message");
  const sendBtn = document.getElementById("sendBtn");
  let typingTimeout;

  sendBtn.onclick = sendMessage;
  msgInput.onkeyup = e => e.key === "Enter" && sendMessage();

  // ===== Indication "en train d’écrire" =====
  msgInput.oninput = () => {
    socket.emit("typing", { from: user, to: toUser });
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
      socket.emit("stopTyping", { from: user, to: toUser });
    }, 1500);
  };

  function sendMessage() {
    if (!msgInput.value) return;
    socket.emit("privateMessage", {
      from: user,
      to: toUser,
      text: msgInput.value
    });
    msgInput.value = "";
  }

  // ===== Réception messages =====
  socket.on("privateMessage", showMessage);
  socket.on("history", msgs => msgs.forEach(showMessage));

  // ===== Typing events =====
  socket.on("typing", d => {
    if (d.from === toUser)
      document.getElementById("typingStatus").innerText =
        `${toUser} est en train d’écrire...`;
  });

  socket.on("stopTyping", () => {
    document.getElementById("typingStatus").innerText = "";
  });

  // ===== Vu =====
  socket.on("seen", d => {
    document.querySelectorAll(".seen").forEach(e => {
      e.innerText = "Vu à " + new Date().toLocaleTimeString().slice(0,5);
    });
  });

  // ===== Suppression =====
  socket.on("deleteMessage", id => {
    const el = document.getElementById("msg-" + id);
    if (el) el.remove();
  });

  // ===== Affichage message =====
  function showMessage(m) {
    if (m.from !== user && m.from !== toUser) return;

    const div = document.createElement("div");
    div.id = "msg-" + m.id;
    div.classList.add("message");
    div.classList.add(m.from === user ? "sent" : "received");

    div.innerHTML = `
      <b>${m.from}</b> : ${m.text}
      <br>
      <small class="seen">${m.from === user && m.seen ? "Vu à " + m.time : ""}</small>
      ${m.from === user ? `<button onclick="deleteMsg(${m.id})">🗑️</button>` : ""}
    `;

    document.getElementById("messages").appendChild(div);
    document.getElementById("messages").scrollTop = document.getElementById("messages").scrollHeight;

    // Marquer comme vu si reçu
    if (m.from === toUser) socket.emit("seen", { from: toUser, to: user });
  }
}

function deleteMsg(id) {
  socket.emit("deleteMessage", id);
}

function logout() {
  localStorage.removeItem("user");
  localStorage.removeItem("toUser");
  window.location.href = "index.html";
              }
