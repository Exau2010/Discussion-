const socket = io();

// ===== Auth & navigation =====
if (!localStorage.getItem("user") && !window.location.href.includes("index.html")) {
    window.location.href = "index.html";
}

const user = localStorage.getItem("user");
if (document.getElementById("user")) {
    document.getElementById("user").innerText = user;
}

function logout() {
    localStorage.removeItem("user");
    localStorage.removeItem("toUser");
    localStorage.removeItem("selectedUser");
    window.location.href = "index.html";
}

function goHome() {
    window.location.href = "home.html";
}

// ===== Connexion =====
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

// ===== Inscription =====
async function register() {
    const username = document.getElementById("username").value;
    const password = document.getElementById("password").value;

    const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
    });

    const data = await res.json();
    if (data.error) return alert(data.error);

    alert("Compte créé !");
    window.location.href = "index.html";
}

// ===== HOME : liste des utilisateurs =====
if (document.getElementById("userList")) {
    socket.emit("getUsers");

    socket.on("users", users => {
        const list = document.getElementById("userList");
        list.innerHTML = "";

        users
            .filter(u => u.username !== user)
            .forEach(u => {
                const li = document.createElement("li");
                li.innerText = u.username + (u.online ? " (en ligne)" : " (hors ligne)");
                li.onclick = () => {
                    localStorage.setItem("selectedUser", u.username);
                    window.location.href = "user.html";
                };
                list.appendChild(li);
            });
    });
}

// ===== PAGE USER =====
if (document.getElementById("profileUsername")) {
    const profileUser = localStorage.getItem("selectedUser");

    document.getElementById("profileUsername").innerText = profileUser;
    document.getElementById("profileUsernameDetail").innerText = profileUser;

    socket.emit("getUserStatus", profileUser);

    socket.on("userStatus", data => {
        if (data.username === profileUser) {
            document.getElementById("profileStatus").innerText =
                data.online ? "En ligne" : "Hors ligne";
        }
    });

    document.getElementById("startChatBtn").onclick = () => {
        localStorage.setItem("toUser", profileUser);
        window.location.href = "chat.html";
    };
}

// ===== CHAT PRIVÉ =====
if (document.getElementById("toUser")) {
    const toUser = localStorage.getItem("toUser");
    document.getElementById("toUser").innerText = toUser;

    socket.emit("join", user);

    const sendBtn = document.getElementById("sendBtn");
    const messageInput = document.getElementById("message");

    sendBtn.onclick = sendMessage;
    messageInput.addEventListener("keyup", e => {
        if (e.key === "Enter") sendMessage();
    });

    function sendMessage() {
        const text = messageInput.value.trim();
        if (!text) return;

        socket.emit("privateMessage", {
            from: user,
            to: toUser,
            text
        });

        messageInput.value = "";
    }

    socket.on("privateMessage", m => {
        if (m.from === user || m.from === toUser) {
            showMessage(m);
        }
    });

    socket.on("history", msgs => {
        msgs.forEach(m => {
            if (m.from === user || m.from === toUser) {
                showMessage(m);
            }
        });
    });

    // ===== AFFICHAGE DES MESSAGES (CORRIGÉ) =====
    function showMessage(m) {
        const div = document.createElement("div");
        div.classList.add("message");

        if (m.from === user) {
            div.classList.add("sent");       // → DROITE
            div.innerText = m.text;
        } else {
            div.classList.add("received");   // ← GAUCHE
            div.innerText = m.from + " : " + m.text;
        }

        const messages = document.getElementById("messages");
        messages.appendChild(div);
        messages.scrollTop = messages.scrollHeight;
    }
                            }
