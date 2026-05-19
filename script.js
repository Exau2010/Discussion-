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

const isAdmin = localStorage.getItem("isAdmin") === "true";

// ===== Unread messages =====

let unreadFrom = JSON.parse(localStorage.getItem("unreadFrom") || "{}");

function saveUnread() {
    localStorage.setItem("unreadFrom", JSON.stringify(unreadFrom));
}

function isSmallScreen() {
    return window.innerWidth < 768;
}

socket.on("newMessageNotification", ({ from, to }) => {

    if (to !== user) return;

    const currentChat = localStorage.getItem("toUser");

    const onChatPage = document.getElementById("toUser") !== null;

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

function updateRedDot(fromUser) {

    const dots = document.querySelectorAll(`.red-dot[data-user="${fromUser}"]`);

    dots.forEach(d => d.remove());

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

        setTimeout(() => d.remove(), 300);

    });

}

function addNotificationPanel(fromUser) {

    const panel = document.querySelector(".right-panel");

    if (!panel) return;

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
    `;

    item.innerHTML = `
        <div style="
        width:8px;
        height:8px;
        background:#ff4d6d;
        border-radius:50%;
        "></div>

        <div style="flex:1;color:#e8eaed;font-size:13px;">
            <strong style="color:#00e5a0;">${fromUser}</strong>
            vous a envoyé un message
        </div>

        <span class="notif-count"
        style="
        background:#ff4d6d;
        color:white;
        border-radius:999px;
        padding:2px 8px;
        font-size:11px;
        font-weight:bold;
        ">
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

    const item = document.querySelector(`.notif-item[data-from="${fromUser}"]`);

    if (item) {

        item.style.opacity = "0";

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

        headers: {
            "Content-Type": "application/json"
        },

        body: JSON.stringify({
            username,
            password
        })

    });

    const data = await res.json();

    if (data.error) {
        return alert(data.error);
    }

    localStorage.setItem("user", username);

    // ===== ADMIN =====

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

    if (!username || !password) {
        return alert("Champs manquants");
    }

    const res = await fetch("/api/register", {

        method: "POST",

        headers: {
            "Content-Type": "application/json"
        },

        body: JSON.stringify({
            username,
            password
        })

    });

    const data = await res.json();

    if (data.error) {
        return alert(data.error);
    }

    alert("Compte créé !");

    window.location.href = "index.html";

}

// ===== DELETE ACCOUNT =====

async function deleteOwnAccount() {

    const confirmed = confirm("Voulez-vous supprimer votre compte ?");

    if (!confirmed) return;

    const res = await fetch("/api/delete-account", {

        method: "POST",

        headers: {
            "Content-Type": "application/json"
        },

        body: JSON.stringify({
            username: user
        })

    });

    const data = await res.json();

    if (data.error) {
        return alert(data.error);
    }

    localStorage.clear();

    window.location.href = "index.html";

}

// ===== ADMIN DELETE =====

async function adminDeleteUser(targetUsername) {

    const confirmed = confirm(`Supprimer ${targetUsername} ?`);

    if (!confirmed) return;

    const res = await fetch("/api/admin/delete-user", {

        method: "POST",

        headers: {
            "Content-Type": "application/json"
        },

        body: JSON.stringify({
            adminUsername: "JEX-EXAU-ARI",
            targetUsername
        })

    });

    const data = await res.json();

    if (data.error) {
        return alert(data.error);
    }

    alert("Compte supprimé");

}

// ===== HOME USERS =====

if (document.getElementById("userList")) {

    socket.emit("getUsers");

    socket.on("users", users => {

        const list = document.getElementById("userList");

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
                transition:0.2s;
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
            ">
            ${u.username}
            </span>
            `;

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

            if (isAdmin) {

                const delBtn = document.createElement("button");

                delBtn.innerText = "Supprimer";

                delBtn.style.cssText = `
                    margin-top:10px;
                    margin-left:10px;
                    padding:10px 14px;
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

        });

    });

    socket.on("userDeleted", data => {

        if (data.username === user) {

            localStorage.clear();

            alert("Votre compte a été supprimé");

            window.location.href = "index.html";

        } else {

            socket.emit("getUsers");

        }

    });

}

// ===== PROFILE =====

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

    document.getElementById("startChatBtn").addEventListener("click", () => {

        localStorage.setItem("toUser", profileUser);

        window.location.href = "chat.html";

    });

}

// ===== CHAT =====

if (document.getElementById("toUser")) {

    const toUser = localStorage.getItem("toUser");

    document.getElementById("toUser").innerText = toUser;

    socket.emit("join", user);

    const sendBtn = document.getElementById("sendBtn");

    sendBtn.addEventListener("click", sendMessage);

    document.getElementById("message").addEventListener("keyup", e => {

        if (e.key === "Enter") {
            sendMessage();
        }

    });

    function sendMessage() {

        const input = document.getElementById("message");

        if (!input.value) return;

        socket.emit("privateMessage", {

            from: user,
            to: toUser,
            text: input.value

        });

        input.value = "";

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

    socket.on("deleteMessage", id => {

        const target = document.querySelector(`.msg[data-id="${id}"]`);

        if (target) {

            target.style.transition = "0.25s";

            target.style.opacity = "0";

            target.style.transform = "scale(0.9)";

            setTimeout(() => {

                target.remove();

            }, 250);

        }

    });

    function showMessage(m) {

        const messages = document.getElementById("messages");

        const msg = document.createElement("div");

        msg.className = "msg " + (m.from === user ? "me" : "them");

        msg.dataset.id = m.id;

        const bubble = document.createElement("div");

        bubble.className = "msg-bubble";

        const text = document.createElement("span");

        text.innerText = m.text;

        bubble.appendChild(text);

        // ===== DELETE BUTTON =====

        if (m.from === user) {

            const del = document.createElement("button");

            del.type = "button";

            del.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round">
            <path d="M3 6h18"/>
            <path d="M8 6V4h8v2"/>
            <path d="M19 6l-1 14H6L5 6"/>
            <path d="M10 11v6"/>
            <path d="M14 11v6"/>
            </svg>
            `;

            del.style.cssText = `
                margin-left:10px;
                width:30px;
                height:30px;
                display:flex;
                align-items:center;
                justify-content:center;
                border:none;
                border-radius:10px;
                background:rgba(255,77,109,0.12);
                color:#ff4d6d;
                cursor:pointer;
                transition:0.2s;
                flex-shrink:0;
            `;

            del.addEventListener("mouseenter", () => {

                del.style.background = "rgba(255,77,109,0.25)";

                del.style.transform = "scale(1.08)";

            });

            del.addEventListener("mouseleave", () => {

                del.style.background = "rgba(255,77,109,0.12)";

                del.style.transform = "scale(1)";

            });

            del.addEventListener("click", e => {

                e.stopPropagation();

                socket.emit("deleteMessage", m.id);

            });

            bubble.appendChild(del);

        }

        msg.appendChild(bubble);

        messages.appendChild(msg);

        messages.scrollTop = messages.scrollHeight;

    }

}
