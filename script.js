// =========================
// script.js — JEXREY (Mis à jour avec photos de profil)
// =========================

// Socket.io — initialisé seulement si disponible (pas sur la page login)
const socket = (typeof io !== "undefined") ? io() : null;

// ===== Auth & navigation =====

if (!localStorage.getItem("user") && !window.location.href.includes("index.html")) {
    window.location.href = "index.html";
}

const user = localStorage.getItem("user");

if (document.getElementById("user")) {
    document.getElementById("user").innerText = user;
}

if (document.getElementById("user1")) {
    document.getElementById("user1").innerText = user;
}

// ===== Unread messages =====

let unreadFrom = JSON.parse(localStorage.getItem("unreadFrom") || "{}");

function saveUnread() {
    localStorage.setItem("unreadFrom", JSON.stringify(unreadFrom));
}

function isSmallScreen() {
    return window.innerWidth < 768;
}

if (socket) socket.on("newMessageNotification", ({ from, to }) => {
    if (to !== user) return;

    const currentChat = localStorage.getItem("toUser");
    const onChatPage  = document.getElementById("toUser") !== null;

    if (onChatPage && currentChat === from) return;

    if (!unreadFrom[from]) unreadFrom[from] = 0;
    unreadFrom[from]++;
    saveUnread();

    if (isSmallScreen()) {
        updateRedDot(from);
    } else {
        addNotificationPanel(from);
    }
});

if (socket) socket.on("messagesRead", ({ from }) => {
    if (unreadFrom[from]) {
        delete unreadFrom[from];
        saveUnread();
        removeRedDot(from);
        removeNotificationPanel(from);
    }
});

// Restaurer les badges au chargement
window.addEventListener("DOMContentLoaded", () => {
    Object.keys(unreadFrom).forEach(fromUser => {
        if (unreadFrom[fromUser] > 0 && !isSmallScreen()) {
            addNotificationPanel(fromUser);
        }
    });
});

function updateRedDot(fromUser) {
    document.querySelectorAll(`.red-dot[data-user="${fromUser}"]`).forEach(d => d.remove());

    document.querySelectorAll(`[data-username="${fromUser}"]`).forEach(card => {
        const dot = document.createElement("div");
        dot.className = "red-dot";
        dot.setAttribute("data-user", fromUser);
        dot.style.cssText = `
            position:absolute;top:6px;right:6px;
            width:12px;height:12px;
            background:#ff4d6d;border-radius:50%;
            border:2px solid #080a0c;z-index:100;
        `;
        card.appendChild(dot);
    });
}

function removeRedDot(fromUser) {
    document.querySelectorAll(`.red-dot[data-user="${fromUser}"]`).forEach(d => {
        d.style.opacity = "0";
        d.style.transition = "opacity 0.3s";
        setTimeout(() => d.remove(), 300);
    });
}

function addNotificationPanel(fromUser) {
    let panel = document.getElementById("jex-notif-panel");

    if (!panel) {
        panel = document.createElement("div");
        panel.id = "jex-notif-panel";
        panel.style.cssText = `
            position:fixed;top:80px;right:20px;
            width:260px;z-index:9999;
            display:flex;flex-direction:column;gap:8px;
        `;
        document.body.appendChild(panel);
    }

    const existing = panel.querySelector(`.notif-item[data-from="${fromUser}"]`);
    if (existing) {
        const countEl = existing.querySelector(".notif-count");
        if (countEl) countEl.textContent = unreadFrom[fromUser];
        return;
    }

    const item = document.createElement("div");
    item.className = "notif-item";
    item.setAttribute("data-from", fromUser);
    item.style.cssText = `
        display:flex;align-items:center;gap:10px;
        padding:12px;background:rgba(255,255,255,0.04);
        border-radius:14px;margin-bottom:8px;cursor:pointer;
        border:1px solid rgba(255,255,255,0.08);
        backdrop-filter:blur(10px);
    `;

    item.innerHTML = `
        <div style="width:8px;height:8px;background:#ff4d6d;border-radius:50%;flex-shrink:0;"></div>
        <div style="flex:1;color:#e8eaed;font-size:13px;">
            <strong style="color:#00e5a0;">${fromUser}</strong> vous a envoyé un message
        </div>
        <span class="notif-count" style="background:#ff4d6d;color:white;border-radius:999px;padding:2px 8px;font-size:11px;font-weight:bold;">
            ${unreadFrom[fromUser]}
        </span>
    `;

    item.addEventListener("click", () => {
        localStorage.setItem("toUser", fromUser);
        window.location.href = "chat.html";
    });

    panel.appendChild(item);
}

function removeNotificationPanel(fromUser) {
    const panel = document.getElementById("jex-notif-panel");
    const item = panel ? panel.querySelector(`.notif-item[data-from="${fromUser}"]`) : document.querySelector(`.notif-item[data-from="${fromUser}"]`);
    if (item) {
        item.style.opacity = "0";
        item.style.transition = "opacity 0.3s";
        setTimeout(() => item.remove(), 300);
    }
}

// ===== Logout =====

function logout() {
    localStorage.clear();
    window.location.href = "index.html";
}

function goHome() {
    window.location.href = "home.html";
}

// ===== LOGIN =====

async function login() {
    let username = document.getElementById("login-username").value.trim();
    let password = document.getElementById("login-password").value;

    const res  = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
    });

    const data = await res.json();
    if (data.error) return alert(data.error);

    localStorage.setItem("user", username);

    if (data.isAdmin === true) {
        localStorage.setItem("isAdmin", "true");
    } else {
        localStorage.removeItem("isAdmin");
    }

    // Sauvegarder l'avatar récupéré au login
    if (data.avatar) {
        localStorage.setItem("myAvatar", data.avatar);
    }

    window.location.href = "home.html";
}

// ===== REGISTER =====

async function register() {
    let username = document.getElementById("register-username").value.trim();
    let password = document.getElementById("register-password").value;

    if (!username || !password) return alert("Champs manquants");

    const res  = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
    });

    const data = await res.json();
    if (data.error) return alert(data.error);

    alert("Compte créé !");
    window.location.href = "index.html";
}

// ===== ADMIN DELETE USER =====

async function adminDeleteUser(targetUsername) {
    const confirmed = confirm(`Supprimer le compte de ${targetUsername} ?`);
    if (!confirmed) return;

    const res  = await fetch("/api/admin/delete-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminUsername: user, targetUsername })
    });

    const data = await res.json();
    if (data.error) return alert(data.error);

    alert("Compte supprimé");
}

// ===== DELETE OWN ACCOUNT =====

async function deleteOwnAccount() {
    const confirmed = confirm("Supprimer votre compte définitivement ? Cette action est irréversible.");
    if (!confirmed) return;

    const res = await fetch("/api/delete-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: user })
    });

    const data = await res.json();
    if (data.error) return alert(data.error);

    localStorage.clear();
    window.location.href = "index.html";
}

// ===== HOME USERS =====

if (document.getElementById("userList")) {

    // Rejoindre dès la connexion (gère reconnexions automatiques)
    function joinAndGetUsers() {
        if (!socket) return;
        socket.emit("join", user);
        socket.emit("getUsers");
    }
    if (socket) {
        socket.on("connect", joinAndGetUsers);
        if (socket.connected) joinAndGetUsers();

        // Fallback HTTP : si le socket met trop de temps, charger les users via API
        setTimeout(async () => {
            const list = document.getElementById("userList");
            // Si userList est encore vide/skeleton après 3s, utiliser HTTP
            if (list && list.querySelector(".user-card-item") === null) {
                try {
                    const r = await fetch('/api/users');
                    if (r.ok) {
                        const users = await r.json();
                        if (typeof loadAvatars === 'function') await loadAvatars(users.map(u => u.username));
                        renderUsersWithNews(users);
                    }
                } catch {}
            }
        }, 3000);
    }

    socket.on("users", async (users) => {
        // Charger les avatars si la fonction existe (définie dans home.html)
        if (typeof loadAvatars === 'function') {
            const usernames = users.map(u => u.username);
            await loadAvatars(usernames);
        }
        renderUsersWithNews(users);

        // Update datalist for search
        const dl = document.getElementById("mylist");
        if (dl) {
            dl.innerHTML = "";
            users.forEach(u => {
                const opt = document.createElement("option");
                opt.value = u.username;
                dl.appendChild(opt);
            });
        }
    });

    socket.on("userDeleted", deletedUsername => {
        if (deletedUsername === user) {
            localStorage.clear();
            alert("Votre compte a été supprimé");
            window.location.href = "index.html";
        } else {
            socket.emit("getUsers");
        }
    });
}

// ===== PROFILE PAGE =====

if (document.getElementById("profileUsernameDetail")) {

    const selectedUser = localStorage.getItem("selectedUser");
    if (!selectedUser) window.location.href = "home.html";

    document.querySelectorAll("#profileUsername").forEach(el => {
        el.innerText = selectedUser;
    });

    document.getElementById("profileUsernameDetail").innerText = selectedUser;

    // Rejoindre dès la connexion (gère reconnexions automatiques)
    function joinAndGetUsers() {
        if (!socket) return;
        socket.emit("join", user);
        socket.emit("getUsers");
    }
    if (socket) {
        socket.on("connect", joinAndGetUsers);
        if (socket.connected) joinAndGetUsers();

        // Fallback HTTP : si le socket met trop de temps, charger les users via API
        setTimeout(async () => {
            const list = document.getElementById("userList");
            // Si userList est encore vide/skeleton après 3s, utiliser HTTP
            if (list && list.querySelector(".user-card-item") === null) {
                try {
                    const r = await fetch('/api/users');
                    if (r.ok) {
                        const users = await r.json();
                        if (typeof loadAvatars === 'function') await loadAvatars(users.map(u => u.username));
                        renderUsersWithNews(users);
                    }
                } catch {}
            }
        }, 3000);
    }

    socket.on("users", users => {
        const found    = users.find(u => u.username === selectedUser);
        const statusEl = document.getElementById("profileStatus");
        if (statusEl) {
            statusEl.innerHTML = found && found.online
                ? `<span style="color:#22c55e;">● En ligne</span>`
                : `<span style="color:#6b7280;">● Hors ligne</span>`;
        }
    });

    const startChatBtn = document.getElementById("startChatBtn");
    if (startChatBtn) {
        if (selectedUser === user) {
            startChatBtn.style.display = "none";
        } else {
            startChatBtn.addEventListener("click", () => {
                localStorage.setItem("toUser", selectedUser);
                window.location.href = "chat.html";
            });
        }
    }
}
