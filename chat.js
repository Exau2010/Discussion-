const socket = io({ query: { username: localStorage.getItem("user") } });

const user = localStorage.getItem("user");

if (!user) location.href = "index.html";

if (document.getElementById("toUser")) {
  const toUser = localStorage.getItem("toUser");
  document.getElementById("toUser").innerText = toUser;

  // Rejoindre le chat
  socket.emit("join", user);

  const msgInput = document.getElementById("message");
  const sendBtn = document.getElementById("sendBtn");
  const typingStatus = document.getElementById("typingStatus");
  let typingTimeout;

  // Envoi message
  sendBtn.onclick = sendMessage;
  msgInput.onkeyup = e => { if (e.key === "Enter") sendMessage(); };

  // Événement "en train d'écrire"
  msgInput.oninput = () => {
    socket.emit("typing", { from: user, to: toUser });
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
      socket.emit("stopTyping", { from: user, to: toUser });
    }, 1500);
  };

  function sendMessage() {
    const text = msgInput.value.trim();
    if (!text) return;

    const msg = {
      from: user,
      to: toUser,
      text,
      seen: false,
      time: new Date().toLocaleTimeString().slice(0, 5)
    };

    socket.emit("privateMessage", msg);
    msgInput.value = "";
  }

  // Réception des messages privés
  socket.on("privateMessage", m => showMessage(m));

  // Historique
  socket.on("history", msgs => msgs.forEach(m => showMessage(m)));

  // Typing indicator
  socket.on("typing", d => {
    if (d.from === toUser)
      typingStatus.innerText = `${toUser} est en train d’écrire...`;
  });

  socket.on("stopTyping", d => {
    if (d.from === toUser) typingStatus.innerText = "";
  });

  // Message vu (retour serveur)
  socket.on("seen", d => {
    const el = document.querySelector(`#msg-${d.messageId} .seen`);
    if (el) el.innerText = "Vu à " + d.time;
  });

  // Suppression de message
  socket.on("deleteMessage", id => {
    const el = document.getElementById("msg-" + id);
    if (el) el.remove();
  });

  // Fonction d'affichage
  function showMessage(m) {
    if (
      (m.from === user && m.to === toUser) ||
      (m.from === toUser && m.to === user)
    ) {
      const div = document.createElement("div");
      div.id = "msg-" + m._id;
      div.classList.add("message");
      div.classList.add(m.from === user ? "sent" : "received");

      div.innerHTML = `
        <b>${m.from}</b> : ${m.text}
        <br>
        <small class="seen">
          ${m.from === user && m.seen ? "Vu à " + m.time : ""}
        </small>
        ${
          m.from === user
            ? `<button onclick="deleteMsg('${m._id}')">🗑️</button>`
            : ""
        }
      `;

      document.getElementById("messages").appendChild(div);
      document.getElementById("messages").scrollTop =
        document.getElementById("messages").scrollHeight;

      // Marquer comme vu UNIQUEMENT si la page est active
      if (
        m.from === toUser &&
        document.visibilityState === "visible"
      ) {
        socket.emit("seen", {
          messageId: m._id
        });
      }
    }
  }
}

// Supprimer un message
function deleteMsg(id) {
  socket.emit("deleteMessage", id);
}

// Déconnexion
function logout() {
  localStorage.removeItem("user");
  localStorage.removeItem("toUser");
  window.location.href = "index.html";
    }
