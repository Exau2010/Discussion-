const socket = io();

const user = localStorage.getItem("user");
const toUser = localStorage.getItem("toUser");

document.getElementById("toUser").innerText = toUser;

// rejoindre la room privée
socket.emit("joinPrivate", { user, toUser });

// afficher un message
function showMessage(m) {
  const div = document.createElement("div");
  div.classList.add("message");

  if (m.from === user) {
    div.classList.add("me");
  } else {
    div.classList.add("other");
  }

  div.innerText = m.text;
  document.getElementById("messages").appendChild(div);
  document.getElementById("messages").scrollTop =
    document.getElementById("messages").scrollHeight;
}

// réception message
socket.on("privateMessage", (m) => {
  showMessage(m);
});

// envoi message
document.getElementById("sendBtn").onclick = () => {
  const input = document.getElementById("message");
  const text = input.value.trim();

  if (text === "") return;

  const msg = { from: user, to: toUser, text };
  socket.emit("privateMessage", msg);
  showMessage(msg);

  input.value = "";
};

// déconnexion
function logout() {
  localStorage.clear();
  window.location.href = "index.html";
            }
