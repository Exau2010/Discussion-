const socket = io({ query: { username: localStorage.getItem("user") } });

const user = localStorage.getItem("user");
if (!user) location.href = "index.html";

let selectedFile = null;
let selectedType = null;

if (document.getElementById("toUser")) {

  const toUser = localStorage.getItem("toUser");
  document.getElementById("toUser").innerText = toUser;

  socket.emit("join", user);

  const msgInput = document.getElementById("message");
  const sendBtn = document.getElementById("sendBtn");
  const typingStatus = document.getElementById("typingStatus");
  let typingTimeout;

  sendBtn.onclick = sendMessage;
  msgInput.onkeyup = e => { if(e.key==="Enter") sendMessage(); }

  // ===== Typing =====
  msgInput.oninput = () => {
    socket.emit("typing", { from: user, to: toUser });
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
      socket.emit("stopTyping", { from: user, to: toUser });
    }, 1500);
  };

  // ===== Fichier =====
  document.getElementById("fileInput").addEventListener("change", e => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function () {
      selectedFile = reader.result;
      selectedType = file.type.startsWith("image") ? "image" : "video";
    };
    reader.readAsDataURL(file);
  });

  function sendMessage() {
    const text = msgInput.value.trim();
    if (!text && !selectedFile) return;

    const msg = {
      id: Date.now(),
      from: user,
      to: toUser,
      text,
      file: selectedFile,
      fileType: selectedType,
      seen: false,
      time: new Date().toLocaleTimeString().slice(0,5)
    };

    socket.emit("privateMessage", msg);

    msgInput.value = "";
    selectedFile = null;
    selectedType = null;
  }

  socket.on("privateMessage", m => showMessage(m));
  socket.on("history", msgs => msgs.forEach(m => showMessage(m)));

  socket.on("typing", d => {
    if(d.from === toUser) typingStatus.innerText = `${toUser} est en train d’écrire...`;
  });

  socket.on("stopTyping", d => {
    if(d.from === toUser) typingStatus.innerText = "";
  });

  socket.on("seen", () => {
    document.querySelectorAll(".seen").forEach(e => {
      e.innerText = "Vu";
    });
  });

  socket.on("deleteMessage", id => {
    const el = document.getElementById("msg-" + id);
    if(el) el.remove();
  });

  function showMessage(m){
    if ((m.from === user && m.to === toUser) || (m.from === toUser && m.to === user)) {

      const div = document.createElement("div");
      div.id = "msg-" + m.id;
      div.classList.add("message");
      div.classList.add(m.from === user ? "sent" : "received");

      let content = `<b>${m.from}</b> : ${m.text || ""}<br>`;

      if (m.file) {
        if (m.fileType === "image") {
          content += `<img src="${m.file}" style="max-width:200px;border-radius:10px;">`;
        } else {
          content += `<video controls style="max-width:200px;border-radius:10px;">
                        <source src="${m.file}">
                      </video>`;
        }
      }

      content += `
      <br>
      <small class="seen"></small>
      ${m.from === user ? `<button onclick="deleteMsg('${m.id}')">🗑️</button>` : ""}
      `;

      div.innerHTML = content;

      document.getElementById("messages").appendChild(div);
      document.getElementById("messages").scrollTop = document.getElementById("messages").scrollHeight;

      if(m.from === toUser) socket.emit("seen", { from: toUser, to: user });
    }
  }
}

function deleteMsg(id){
  socket.emit("deleteMessage", id);
}

function logout() {
  localStorage.removeItem("user");
  localStorage.removeItem("toUser");
  window.location.href="index.html";
}