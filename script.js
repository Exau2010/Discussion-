// =========================
// script.js COMPLET (CORRIGÉ)
// =========================

const socket = io();

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

socket.on("newMessageNotification", ({ from, to }) => {

    // BUG CORRIGÉ : on vérifie `user` (string) et non `to !== user`
    // `to` reçu du serveur doit correspondre à l'utilisateur connecté
    if (to !== user) return;

    const currentChat = localStorage.getItem("toUser");
    const onChatPage = document.getElementById("toUser") !== null;

    // Si on est déjà sur la conversation avec cet expéditeur, pas de notif
    if (onChatPage && currentChat === from) return;

    if (!unreadFrom[from]) {
        unreadFrom[from] = 0;
    }

    unreadFrom[from]++;
    saveUnread();

    if (isSmallScreen()) {
        updateRedDot(from);
    } else {
        addNotificationPanel(from);
    }
});

socket.on("messagesRead", ({ from }) => {
    if (unreadFrom[from]) {
        delete unreadFrom[from];
        saveUnread();
        removeRedDot(from);
        removeNotificationPanel(from);
    }
});

// BUG CORRIGÉ : les badges non-lus sont restaurés au chargement de la page
window.addEventListener("DOMContentLoaded", () => {
    Object.keys(unreadFrom).forEach(fromUser => {
        if (unreadFrom[fromUser] > 0) {
            if (isSmallScreen()) {
                // Les red-dots se mettent à jour une fois que la liste est rendue (voir users event)
                // On les re-applique via un flag, géré dans le rendu des cards
            } else {
                addNotificationPanel(fromUser);
            }
        }
    });
});

function updateRedDot(fromUser) {
    // Supprimer les anciens dots pour cet utilisateur
    document.querySelectorAll(`.red-dot[data-user="${fromUser}"]`).forEach(d => d.remove());

    const cards = document.querySelectorAll(`.pro[data-username="${fromUser}"]`);

    cards.forEach(card => {
        const dot = document.createElement("div");
        dot.className = "red-dot";
        dot.setAttribute("data-user", fromUser);
        dot.style.cssText = `
            position:absolute;
            top:6px;
            right:6px;
            width:12px;
            height:12px;
            background:#ff4d6d;
            border-radius:50%;
            border:2px solid #080a0c;
            z-index:100;
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
    // BUG CORRIGÉ : création dynamique du panel s'il n'existe pas dans le DOM
    let panel = document.querySelector(".right-panel");

    if (!panel) {
        // Créer le panel s'il n'existe pas (pour les pages qui ne l'ont pas dans le HTML)
        panel = document.createElement("div");
        panel.className = "right-panel";
        panel.style.cssText = `
            position:fixed;
            top:80px;
            right:20px;
            width:260px;
            z-index:9999;
            display:flex;
            flex-direction:column;
        `;
        document.body.appendChild(panel);
    }

    const existing = panel.querySelector(`.notif-item[data-from="${fromUser}"]`);

    if (existing) {
        const countEl = existing.querySelector(".notif-count");
        if (countEl) {
            countEl.textContent = unreadFrom[fromUser];
        }
        return;
    }

    const item = document.createElement("div");
    item.className = "notif-item";
    item.setAttribute("data-from", fromUser);
    item.style.cssText = `
        display:flex;
        align-items:center;
        gap:10px;
        padding:12px;
        background:rgba(255,255,255,0.04);
        border-radius:14px;
        margin-bottom:8px;
        cursor:pointer;
        border:1px solid rgba(255,255,255,0.08);
        backdrop-filter:blur(10px);
        animation: slideIn 0.3s ease;
    `;

    item.innerHTML = `
        <style>
            @keyframes slideIn {
                from { opacity: 0; transform: translateX(20px); }
                to   { opacity: 1; transform: translateX(0); }
            }
        </style>
        <div style="
            width:8px;
            height:8px;
            background:#ff4d6d;
            border-radius:50%;
            flex-shrink:0;
        "></div>

        <div style="flex:1;color:#e8eaed;font-size:13px;">
            <strong style="color:#00e5a0;">${fromUser}</strong>
            vous a envoyé un message
        </div>

        <span class="notif-count" style="
            background:#ff4d6d;
            color:white;
            border-radius:999px;
            padding:2px 8px;
            font-size:11px;
            font-weight:bold;
        ">${unreadFrom[fromUser]}</span>
    `;

    item.addEventListener("click", () => {
        localStorage.setItem("toUser", fromUser);
        window.location.href = "chat.html";
    });

    panel.appendChild(item);
}

function removeNotificationPanel(fromUser) {
    const item = document.querySelector(`.notif-item[data-from="${fromUser}"]`);
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

    const res = await fetch("/api/login", {
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

    window.location.href = "home.html";
}

// ===== REGISTER =====

async function register() {
    let username = document.getElementById("register-username").value.trim();
    let password = document.getElementById("register-password").value;

    if (!username || !password) return alert("Champs manquants");

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

// ===== ADMIN DELETE =====

async function adminDeleteUser(targetUsername) {
    const confirmed = confirm(`Supprimer ${targetUsername} ?`);
    if (!confirmed) return;

    const res = await fetch("/api/admin/delete-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminUsername: user, targetUsername })
    });

    const data = await res.json();

    if (data.error) return alert(data.error);

    alert("Compte supprimé");
}

// ===== HOME USERS =====

if (document.getElementById("userList")) {

    // BUG CORRIGÉ : émettre "join" AVANT "getUsers" pour s'enregistrer côté serveur
    socket.emit("join", user);

    // BUG CORRIGÉ : attendre que la connexion socket soit établie avant d'émettre getUsers
    socket.on("connect", () => {
        socket.emit("join", user);
        socket.emit("getUsers");
    });

    // Si le socket est déjà connecté au moment du chargement (reconnexion rapide)
    if (socket.connected) {
        socket.emit("join", user);
        socket.emit("getUsers");
    }

    socket.on("users", users => {
        const list = document.getElementById("userList");
        if (!list) return;

        list.innerHTML = "";

        users.filter(u => u.username !== user).forEach(u => {

            const pro = document.createElement("div");
            pro.className = "pro";
            pro.setAttribute("data-username", u.username);
            pro.style.cssText = `
                position:relative;
                background:rgba(255,255,255,0.04);
                border:1px solid rgba(255,255,255,0.08);
                border-radius:18px;
                padding:18px;
                margin-bottom:14px;
                cursor:pointer;
                transition:transform 0.2s, border-color 0.2s;
                backdrop-filter:blur(10px);
            `;

            pro.addEventListener("mouseenter", () => {
                pro.style.transform = "translateY(-2px)";
                pro.style.borderColor = "#00e5a0";
            });

            pro.addEventListener("mouseleave", () => {
                pro.style.transform = "translateY(0px)";
                pro.style.borderColor = "rgba(255,255,255,0.08)";
            });

            const li = document.createElement("li");
            li.style.listStyle = "none";
            li.innerHTML = `
                <span style="
                    font-size:15px;
                    font-weight:600;
                    color:#e8eaed;
                    letter-spacing:0.5px;
                ">${u.username}</span>
            `;

            // Indicateur en ligne
            if (u.online) {
                const onlineDot = document.createElement("span");
                onlineDot.style.cssText = `
                    display:inline-block;
                    width:8px;
                    height:8px;
                    background:#00e5a0;
                    border-radius:50%;
                    margin-left:8px;
                    vertical-align:middle;
                `;
                li.querySelector("span").appendChild(onlineDot);
            }

            const button = document.createElement("button");
            button.innerText = "Voir le profil";
            button.style.cssText = `
                margin-top:12px;
                padding:10px 16px;
                border:none;
                border-radius:12px;
                background:#00e5a0;
                color:#080a0c;
                cursor:pointer;
                font-weight:bold;
            `;

            const goToProfile = () => {
                localStorage.setItem("selectedUser", u.username);
                window.location.href = "profile.html";
            };

            pro.addEventListener("click", goToProfile);
            button.addEventListener("click", e => {
                e.stopPropagation();
                goToProfile();
            });

            pro.appendChild(li);
            pro.appendChild(button);

            // ===== ADMIN DELETE BTN =====
            if (localStorage.getItem("isAdmin") === "true") {
                const delBtn = document.createElement("button");
                delBtn.innerText = "Supprimer";
                delBtn.style.cssText = `
                    margin-top:8px;
                    margin-left:8px;
                    padding:10px 16px;
                    border:none;
                    border-radius:12px;
                    background:#ff4d6d;
                    color:white;
                    cursor:pointer;
                    font-weight:bold;
                `;
                delBtn.addEventListener("click", e => {
                    e.stopPropagation();
                    adminDeleteUser(u.username);
                });
                pro.appendChild(delBtn);
            }

            list.appendChild(pro);

            // BUG CORRIGÉ : appliquer les red-dots APRÈS que les cards sont rendues
            if (isSmallScreen() && unreadFrom[u.username] > 0) {
                updateRedDot(u.username);
            }
        });
    });

    socket.on("userDeleted", deletedUsername => {
        if (deletedUsername === user) {
            localStorage.clear();
            alert("Votre compte a été supprimé");
            window.location.href = "index.html";
        } else {
            // Rafraîchir la liste après suppression
            socket.emit("getUsers");
        }
    });
}

// ===== PROFILE PAGE =====

if (document.getElementById("profileUsernameDetail")) {

    const selectedUser = localStorage.getItem("selectedUser");

    // Si aucun utilisateur sélectionné, retour home
    if (!selectedUser) {
        window.location.href = "home.html";
    }

    // Remplir le nom affiché dans tous les éléments #profileUsername
    document.querySelectorAll("#profileUsername").forEach(el => {
        el.innerText = selectedUser;
    });

    // Remplir le nom principal (grand titre accent)
    document.getElementById("profileUsernameDetail").innerText = selectedUser;

    // Statut en ligne : demander au serveur via socket
    socket.emit("join", user);

    // Récupérer la liste des users pour connaître le statut en ligne
    socket.emit("getUsers");

    socket.on("users", users => {
        const found = users.find(u => u.username === selectedUser);
        const statusEl = document.getElementById("profileStatus");
        if (statusEl) {
            if (found && found.online) {
                statusEl.innerHTML = `<span style="color:#22c55e;">● En ligne</span>`;
            } else {
                statusEl.innerHTML = `<span style="color:#6b7280;">● Hors ligne</span>`;
            }
        }
    });

    // Bouton "Envoyer un message" → chat.html
    const startChatBtn = document.getElementById("startChatBtn");
    if (startChatBtn) {

        // Masquer le bouton si c'est son propre profil
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
