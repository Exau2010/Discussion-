const socket = io();

// ===== Auth & navigation =====
if (!localStorage.getItem("user") && !window.location.href.includes("index.html")) {
  window.location.href = "index.html";
}
const user = localStorage.getItem("user");
if(document.getElementById("user")) document.getElementById("user").innerText = user;

function logout() {
  localStorage.removeItem("user");
  window.location.href = "index.html";
}

function goHome() { window.location.href = "home.html"; }

// ===== Connexion / inscription =====
async function login() {
  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;
  const res = await fetch("/api/login", {
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({username,password})
  });
  const data = await res.json();
  if(data.error) return alert(data.error);
  localStorage.setItem("user", username);
  window.location.href="home.html";
}

async function register() {
  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;
  const res = await fetch("/api/register", {
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({username,password})
  });
  const data = await res.json();
  if(data.error) return alert(data.error);
  alert("Compte créé !");
  window.location.href="index.html";
}

// ===== Home page : liste utilisateurs =====
if(document.getElementById("userList")) {
  socket.emit("getUsers");
  socket.on("users", users => {
    const list = document.getElementById("userList");
    list.innerHTML = "";
    users.filter(u => u.username !== user).forEach(u => {
      const li = document.createElement("li");
      li.innerText = u.username + (u.online?" (online)":"");
      li.onclick = () => {
        localStorage.setItem("selectedUser", u.username);
        window.location.href="user.html";
      }
      list.appendChild(li);
    });
  });
}

// ===== User profile page =====
if(document.getElementById("profileUsername")) {
  const profileUser = localStorage.getItem("selectedUser");
  document.getElementById("profileUsername").innerText = profileUser;
  document.getElementById("profileUsernameDetail").innerText = profileUser;

  socket.emit("getUserStatus", profileUser);
  socket.on("userStatus", data => {
    if(data.username === profileUser) {
      document.getElementById("profileStatus").innerText = data.online ? "En ligne" : "Hors ligne";
    }
  });

  document.getElementById("startChatBtn").addEventListener("click", ()=>{
    localStorage.setItem("toUser", profileUser);
    window.location.href="chat.html";
  });
}

// ===== Chat individuel =====
if(document.getElementById("toUser")) {
  const toUser = localStorage.getItem("toUser");
  document.getElementById("toUser").innerText = toUser;

  socket.emit("join", user);

  const sendBtn = document.getElementById("sendBtn");
  sendBtn.addEventListener("click", sendMessage);
  const messageInput = document.getElementById("message");
  messageInput.addEventListener("keyup", (e)=>{if(e.key==="Enter") sendMessage();});

  function sendMessage() {
    const input = document.getElementById("message");
    if(!input.value) return;
    socket.emit("privateMessage", { from:user, to:toUser, text:input.value });
    input.value="";
  }

  socket.on("privateMessage", m => {
    if(m.from===user || m.from===toUser) showMessage(m);
  });

  socket.on("history", msgs => msgs.forEach(m => { if(m.from===user||m.from===toUser) showMessage(m); }));

  function showMessage(m) {
    const div = document.createElement("div");
    div.innerText = m.from+" : "+m.text;
    document.getElementById("messages").appendChild(div);
    document.getElementById("messages").scrollTop=document.getElementById("messages").scrollHeight;
  }
      }
