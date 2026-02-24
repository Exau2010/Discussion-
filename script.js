const socket = io();

const user = localStorage.getItem("user");
const toUser = localStorage.getItem("toUser");

// sécurité minimale
if (!user) {
  window.location.href = "index.html";
}

// afficher le nom du destinataire
if (document.getElementById("toUser")) {
  document.getElementById("toUser").innerText = toUser;
}

// rejoindre le chat privé
socket.emit("joinPrivate", { user, toUser });

/* ===========================
   AFFICHAGE MESSAGE (FIX)
=========================== */
function showMessage(m) {
  const div = document.createElement("div");

  // 🔥 CLASSES FORCÉES (corrige le problème)
  if (m.from === user) {
    div.className = "message me";
  } else {
    div.className = "message other";
  }

  div.textContent = m.text;

  const container = document.getElementById("messages");
  container.appendChild(div);

  // scroll automatique
  container.scrollTop = container.scrollHeight;
}

/* ===========================
   RECEPTION MESSAGE
=========================== */
socket.on("privateMessage", (m) => {
  showMessage(m);
});

/* ===========================
   ENVOI MESSAGE
=========================== */
const sendBtn = document.getElementById("sendBtn");
const input = document.getElementById("message");

function sendMessage() {
  const text = input.value.trim();
  if (!text) return;

  const msg = {
    from: user,
    to: toUser,
    text: text
  };

  socket.emit("privateMessage", msg);

  // afficher immédiatement le message envoyé
  showMessage(msg);

  input.value = "";
}

if (sendBtn) {
  sendBtn.addEventListener("click", sendMessage);
}

if (input) {
  input.addEventListener("keyup", (e) => {
    if (e.key === "Enter") {
      sendMessage();
    }
  });
}

/* ===========================
   DECONNEXION
=========================== */
function logout() {
  localStorage.clear();
  window.location.href = "index.html";
}
