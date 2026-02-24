const socket = io({ query: { username: localStorage.getItem("user") } });
const user = localStorage.getItem("user");
if (!user) window.location.href = "index.html";

if (document.getElementById("toUser")) {
  const toUser = localStorage.getItem("toUser");
  document.getElementById("toUser").innerText = toUser;

  const msgInput = document.getElementById("message");
  const sendBtn = document.getElementById("sendBtn");
  const messagesDiv = document.getElementById("messages");

  // Indicateur de saisie
  let typingTimeout;
  msgInput.oninput = () => {
    socket.emit("typing", { from: user, to: toUser });
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => socket.emit("stopTyping", { from: user, to: toUser }), 1000);
  };

  sendBtn.onclick = sendMessage;
  msgInput.onkeyup = e => { if (e.key === "Enter") sendMessage(); };

  function sendMessage() {
    const text = msgInput.value.trim();
    if (!text) return;
    const msg = {
      id: Date.now(),
      from: user,
      to: toUser,
      text,
      seen: false,
      time: new Date().toLocaleTimeString().slice(0,5)
    };
    socket.emit("privateMessage", msg);
    msgInput.value = "";
  }

  // Recevoir messages
  socket.on("privateMessage", m => {
    // Filtrer pour cette conversation
    if ((m.from === user && m.to === toUser) || (m.from === toUser && m.to === user)) {
      showMessage(m);
      if (m.from === toUser) socket.emit("seen", { from: toUser, to: user });
    }
  });

  // Historique
  socket.on("history", msgs => msgs.forEach(m => {
    if ((m.from === user && m.to === toUser) || (m.from === toUser && m.to === user)) showMessage(m);
  }));

  socket.on("deleteMessage", id => {
    const el = document.getElementById("msg-" + id);
    if (el) el.remove();
  });

  socket.on("typing", d => {
    if (d.from === toUser) document.getElementById("typingStatus").innerText = toUser + " est en train d'écrire...";
  });
  socket.on("stopTyping", d => {
    if (d.from === toUser) document.getElementById("typingStatus").innerText = "";
  });

  function showMessage(m) {
    const div = document.createElement("div");
    div.id = "msg-" + m.id;
    div.classList.add("message");
    div.classList.add(m.from === user ? "sent" : "received");
    div.innerHTML = `
      <b>${m.from}</b>: ${m.text}<br>
      <small class="seen">${m.from === user && m.seen ? "Vu à " + m.time : ""}</small>
      ${m.from === user ? `<button onclick="deleteMsg(${m.id})">🗑️</button>` : ""}
    `;
    messagesDiv.appendChild(div);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }

  window.deleteMsg = id => { socket.emit("deleteMessage", id); };
}
