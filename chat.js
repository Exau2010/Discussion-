const socket = io();
const user = localStorage.getItem("user");
const toUser = localStorage.getItem("toUser");

if (!user) location.href = "index.html";

document.getElementById("toUser").innerText = toUser;

socket.emit("join", user);

const msgInput = document.getElementById("message");
const imgInput = document.getElementById("imageInput");
const messages = document.getElementById("messages");
const typingStatus = document.getElementById("typingStatus");

let typingTimeout;

// ----- Typing -----
msgInput.oninput = () => {
  socket.emit("typing", toUser);
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => socket.emit("stopTyping", toUser), 1500);
};

// ----- Send message -----
async function sendMessage() {
  const text = msgInput.value.trim();
  let image = null;

  if (imgInput.files[0]) {
    const formData = new FormData();
    formData.append("image", imgInput.files[0]);
    const res = await fetch("/api/upload", { method: "POST", body: formData });
    const data = await res.json();
    image = data.image;
  }

  if (!text && !image) return;

  socket.emit("privateMessage", { from: user, to: toUser, text, image });
  msgInput.value = "";
  imgInput.value = "";
}

// ----- Receive messages -----
socket.on("history", msgs => msgs.forEach(showMessage));
socket.on("privateMessage", showMessage);

socket.on("typing", u => { typingStatus.innerText = u + " est en train d'écrire..."; });
socket.on("stopTyping", () => { typingStatus.innerText = ""; });

socket.on("seen", () => {
  document.querySelectorAll(".sent .status").forEach(e => e.innerText = "Vu");
});

socket.on("deleteMessage", id => {
  const el = document.getElementById("msg-" + id);
  if (el) el.remove();
});

// ----- Display message -----
function showMessage(m) {
  if ((m.from === user && m.to === toUser) || (m.from === toUser && m.to === user)) {
    const div = document.createElement("div");
    div.id = "msg-" + m._id;
    div.className = "message " + (m.from === user ? "sent" : "received");

    div.innerHTML = `
      ${m.text ? `<p>${m.text}</p>` : ""}
      ${m.image ? `<a href="${m.image}" download><img src="${m.image}" width="150"></a>` : ""}
      <small class="status">${m.seen && m.from === user ? "Vu" : ""}</small>
    `;

    let pressTimer;
    div.addEventListener("mousedown", () => pressTimer = setTimeout(() => { if(m.from===user) socket.emit("deleteMessage", m._id); }, 700));
    div.addEventListener("mouseup", () => clearTimeout(pressTimer));
    div.addEventListener("mouseleave", () => clearTimeout(pressTimer));
    div.addEventListener("touchstart", () => pressTimer = setTimeout(() => { if(m.from===user) socket.emit("deleteMessage", m._id); }, 700));
    div.addEventListener("touchend", () => clearTimeout(pressTimer));

    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;

    if (m.from === toUser) socket.emit("seen", toUser);
  }
}

document.getElementById("sendBtn").onclick = sendMessage;
msgInput.addEventListener("keyup", e => { if(e.key==="Enter") sendMessage(); });
