// =========================
// script.js — JEXREY (sans News, notifications améliorées)
// =========================

const socket = (typeof io !== "undefined") ? io() : null;

// ===== Auth =====
if (!localStorage.getItem("user") && !window.location.href.includes("index.html")) {
    window.location.href = "index.html";
}

const user = localStorage.getItem("user");

if (document.getElementById("user"))  document.getElementById("user").innerText  = user;
if (document.getElementById("user1")) document.getElementById("user1").innerText = user;

// ===== Unread messages =====
let unreadFrom = JSON.parse(localStorage.getItem("unreadFrom") || "{}");

function saveUnread() {
    localStorage.setItem("unreadFrom", JSON.stringify(unreadFrom));
}

function getTotalUnread() {
    return Object.values(unreadFrom).reduce((a, b) => a + b, 0);
}

// ===== Notifications : badge dans le header =====
function updateNotifBadge() {
    const badge = document.getElementById("notifBadge");
    if (!badge) return;
    const total = getTotalUnread();
    if (total > 0) {
        badge.textContent = total > 99 ? "99+" : total;
        badge.classList.add("visible");
    } else {
        badge.classList.remove("visible");
    }
}

function renderNotifList() {
    const list = document.getElementById("notifList");
    if (!list) return;
    list.innerHTML = "";
    const keys = Object.keys(unreadFrom).filter(k => unreadFrom[k] > 0);
    if (!keys.length) {
        list.innerHTML = '<div class="notif-empty-text">Aucune notification</div>';
        return;
    }
    keys.forEach(fromUser => {
        const item = document.createElement("div");
        item.className = "notif-item";
        item.setAttribute("data-from", fromUser);
        item.innerHTML = `
            <div class="notif-dot"></div>
            <div class="notif-text"><strong>${fromUser}</strong> vous a envoyé un message</div>
            <span class="notif-count">${unreadFrom[fromUser]}</span>
        `;
        item.addEventListener("click", () => {
            localStorage.setItem("toUser", fromUser);
            window.location.href = "chat.html";
        });
        list.appendChild(item);
    });
}

// Notification reçue
if (socket) socket.on("newMessageNotification", ({ from, to }) => {
    if (to !== user) return;
    const onChatPage  = document.getElementById("toUser") !== null;
    const currentChat = localStorage.getItem("toUser");
    if (onChatPage && currentChat === from) return;

    if (!unreadFrom[from]) unreadFrom[from] = 0;
    unreadFrom[from]++;
    saveUnread();
    updateNotifBadge();

    const dd = document.getElementById("notifDropdown");
    if (dd && dd.classList.contains("open")) renderNotifList();

    // Red dot sur mobile/cartes
    updateRedDot(from);
});

// Message lu
if (socket) socket.on("messagesRead", ({ from }) => {
    if (unreadFrom[from]) {
        delete unreadFrom[from];
        saveUnread();
        updateNotifBadge();
        removeRedDot(from);
        const dd = document.getElementById("notifDropdown");
        if (dd && dd.classList.contains("open")) renderNotifList();
    }
});

// ===== Red dots =====
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

// Restaurer au chargement
window.addEventListener("DOMContentLoaded", () => {
    updateNotifBadge();
    Object.keys(unreadFrom).forEach(fromUser => {
        if (unreadFrom[fromUser] > 0) updateRedDot(fromUser);
    });
});

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
    if (data.isAdmin === true) localStorage.setItem("isAdmin", "true");
    else localStorage.removeItem("isAdmin");
    if (data.avatar) localStorage.setItem("myAvatar", data.avatar);
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
    function joinAndGetUsers() {
        if (!socket) return;
        socket.emit("join", user);
        socket.emit("getUsers");
    }
    if (socket) {
        socket.on("connect", joinAndGetUsers);
        if (socket.connected) joinAndGetUsers();

        setTimeout(async () => {
            const list = document.getElementById("userList");
            if (list && list.querySelector(".user-card-item") === null) {
                try {
                    const r = await fetch('/api/users');
                    if (r.ok) {
                        const users = await r.json();
                        if (typeof loadAvatars === 'function') await loadAvatars(users.map(u => u.username));
                        if (typeof renderUsers === 'function') renderUsers(users);
                    }
                } catch {}
            }
        }, 3000);
    }

    if (socket) socket.on("users", async (users) => {
        if (typeof loadAvatars === 'function') await loadAvatars(users.map(u => u.username));
        if (typeof renderUsers === 'function') renderUsers(users);
        const dl = document.getElementById("mylist");
        if (dl) {
            dl.innerHTML = "";
            users.forEach(u => { const opt = document.createElement("option"); opt.value = u.username; dl.appendChild(opt); });
        }
    });

    if (socket) socket.on("userDeleted", deletedUsername => {
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

    document.querySelectorAll("#profileUsername").forEach(el => { el.innerText = selectedUser; });
    document.getElementById("profileUsernameDetail").innerText = selectedUser;

    function joinAndGetUsers() {
        if (!socket) return;
        socket.emit("join", user);
        socket.emit("getUsers");
    }
    if (socket) {
        socket.on("connect", joinAndGetUsers);
        if (socket.connected) joinAndGetUsers();
    }

    if (socket) socket.on("users", users => {
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
        if (selectedUser === user) startChatBtn.style.display = "none";
        else startChatBtn.addEventListener("click", () => { localStorage.setItem("toUser", selectedUser); window.location.href = "chat.html"; });
    }
}
