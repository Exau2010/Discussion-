// =========================
// chat.js — JEXREY (HTML sécurisé activé)
// =========================

const socket = io({ query: { username: localStorage.getItem("user") } });

const user = localStorage.getItem("user");
if (!user) location.href = "index.html";

let selectedFile = null;
let selectedType = null;

// Cache avatars local pour le chat
let chatAvatarCache = {};

async function getChatAvatar(username) {
    if (chatAvatarCache[username] !== undefined) return chatAvatarCache[username];
    try {
        const r = await fetch('/api/avatars/batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usernames: [username] })
        });
        const d = await r.json();
        chatAvatarCache[username] = d[username] || '';
    } catch {
        chatAvatarCache[username] = '';
    }
    return chatAvatarCache[username];
}

// Écouter les mises à jour d'avatar en temps réel
socket.on("avatarUpdated", ({ username, avatar }) => {
    chatAvatarCache[username] = avatar;

    document.querySelectorAll(`.msg-avatar[data-user="${username}"]`).forEach(el => {
        const img = el.querySelector('img');
        if (img) {
            img.src = avatar;
            img.style.display = avatar ? 'block' : 'none';
        }
    });

    const partnerItem = document.querySelector(`.partner-item[data-username="${username}"] .partner-avatar img`);

    if (partnerItem) {
        partnerItem.src = avatar;
        partnerItem.style.display = avatar ? 'block' : 'none';
    }
});

if (document.getElementById("toUser")) {

    const toUser = localStorage.getItem("toUser");
    if (!toUser) location.href = "home.html";

    document.getElementById("toUser").innerText = toUser;

    async function loadHeaderAvatar() {
        const av = await getChatAvatar(toUser);
        const headerAv = document.querySelector('.chat-header-avatar');

        if (headerAv && av) {
            headerAv.style.backgroundImage = `url('${av}')`;
            headerAv.style.backgroundSize = 'cover';
            headerAv.style.backgroundPosition = 'center';
            headerAv.style.opacity = '1';
        }
    }

    loadHeaderAvatar();

    socket.on("connect", () => {
        socket.emit("join", user);
        socket.emit("getHistory", { from: user, to: toUser });
    });

    if (socket.connected) {
        socket.emit("join", user);
        socket.emit("getHistory", { from: user, to: toUser });
    }

    let unreadFrom = JSON.parse(localStorage.getItem("unreadFrom") || "{}");

    if (unreadFrom[toUser]) {
        delete unreadFrom[toUser];
        localStorage.setItem("unreadFrom", JSON.stringify(unreadFrom));
        socket.emit("seen", { from: toUser, to: user });
    }

    const msgInput = document.getElementById("message");
    const sendBtn = document.getElementById("sendBtn");
    const typingStatus = document.getElementById("typingStatus");

    let typingTimeout;

    sendBtn.onclick = sendMessage;

    msgInput.onkeydown = e => {
        if (e.key === "Enter") sendMessage();
    };

    // ===== Typing =====
    msgInput.oninput = () => {

        socket.emit("typing", {
            from: user,
            to: toUser
        });

        clearTimeout(typingTimeout);

        typingTimeout = setTimeout(() => {

            socket.emit("stopTyping", {
                from: user,
                to: toUser
            });

        }, 1500);
    };

    // ===== Fichier =====
    const fileInput = document.getElementById("fileInput");

    if (fileInput) {

        fileInput.addEventListener("change", e => {

            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();

            reader.onload = () => {
                selectedFile = reader.result;
                selectedType = file.type.startsWith("image") ? "image" : "video";
            };

            reader.readAsDataURL(file);
        });
    }

    // ===== Envoi =====
    function sendMessage() {

        const text = msgInput.value.trim();

        if (!text && !selectedFile) return;

        const tempId = "tmp-" + Date.now();

        const msg = {
            id: tempId,
            from: user,
            to: toUser,
            text,
            file: selectedFile,
            fileType: selectedType,
            seen: false,
            time: new Date().toLocaleTimeString("fr-FR").slice(0, 5)
        };

        showMessage(msg, tempId);

        socket.emit("privateMessage", msg);

        msgInput.value = "";
        selectedFile = null;
        selectedType = null;
    }

    // ===== Confirmation serveur =====
    socket.on("messageConfirmed", ({ tempId, msg }) => {

        const el = document.getElementById("msg-" + tempId);

        if (el) {

            el.id = "msg-" + msg.id;

            const delBtn = el.querySelector(".del-btn");

            if (delBtn) {
                delBtn.setAttribute("data-id", msg.id);
            }
        }
    });

    // ===== Réception message =====
    socket.on("privateMessage", m => {

        if (m.from === user) return;

        showMessage(m);

        socket.emit("seen", {
            from: toUser,
            to: user
        });
    });

    // ===== Historique =====
    socket.on("history", msgs => {

        const container = document.getElementById("messages");

        if (container) container.innerHTML = "";

        msgs.forEach(m => showMessage(m));

        socket.emit("seen", {
            from: toUser,
            to: user
        });
    });

    // ===== Typing =====
    socket.on("typing", d => {
        if (d.from === toUser) {
            typingStatus.innerText = `${toUser} écrit...`;
        }
    });

    socket.on("stopTyping", d => {
        if (d.from === toUser) {
            typingStatus.innerText = "En ligne";
        }
    });

    // ===== Vu =====
    socket.on("seen", () => {

        document.querySelectorAll(".msg-seen").forEach(el => {
            el.innerText = "✓✓ Vu";
            el.style.color = "#00e5a0";
        });
    });

    // ===== Suppression =====
    socket.on("deleteMessage", id => {

        const el = document.getElementById("msg-" + id);

        if (el) {

            el.style.opacity = "0";
            el.style.transition = "opacity 0.3s";

            setTimeout(() => el.remove(), 300);
        }
    });

    // ===== Liste utilisateurs =====
    socket.on("users", async (users) => {

        const listpart = document.getElementById("listpart");
        if (!listpart) return;

        listpart.innerHTML = "";

        const usernames = users
            .filter(u => u.username !== user)
            .map(u => u.username);

        const uncached = usernames.filter(u => !(u in chatAvatarCache));

        if (uncached.length > 0) {

            try {

                const r = await fetch('/api/avatars/batch', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ usernames: uncached })
                });

                const d = await r.json();

                uncached.forEach(u => {
                    chatAvatarCache[u] = d[u] || '';
                });

            } catch {

                uncached.forEach(u => {
                    chatAvatarCache[u] = '';
                });
            }
        }

        users
            .filter(u => u.username !== user)
            .forEach(u => {

                const av = chatAvatarCache[u.username] || '';

                const li = document.createElement("li");

                li.className = "partner-item";
                li.setAttribute("data-username", u.username);
                li.style.cursor = "pointer";

                li.innerHTML = `
                    <div class="partner-avatar" style="position:relative;overflow:hidden;border-radius:10px;">
                        <img src="${av}" alt="" style="${av ? '' : 'display:none;'}width:100%;height:100%;object-fit:cover;position:absolute;inset:0;">
                        ${u.online
                            ? `<div class="dot" style="position:absolute;bottom:-1px;right:-1px;width:10px;height:10px;border-radius:50%;background:#22c55e;border:2px solid #080a0c;z-index:2;"></div>`
                            : ""}
                    </div>

                    <div>
                        <div class="partner-name">${u.username}</div>
                        <div class="partner-sub">${u.online ? "En ligne" : "Hors ligne"}</div>
                    </div>
                `;

                li.addEventListener("click", () => {
                    localStorage.setItem("toUser", u.username);
                    location.reload();
                });

                listpart.appendChild(li);
            });
    });

    socket.emit("getUsers");

    // ===== Affichage message =====
    async function showMessage(m, tempId) {

        const existingId = tempId || m.id;

        if (document.getElementById("msg-" + existingId)) return;

        const isMe = m.from === user;

        if (
            (m.from === user && m.to === toUser) ||
            (m.from === toUser && m.to === user)
        ) {

            const messages = document.getElementById("messages");
            const messagesArea = document.getElementById("messages-area");

            const msgEl = document.createElement("div");

            msgEl.id = "msg-" + (tempId || m.id);
            msgEl.className = "msg " + (isMe ? "me" : "them");

            const text = m.text || "";

            const senderAvatar = await getChatAvatar(m.from);

            const avatar = document.createElement("div");

            avatar.className = "msg-avatar";
            avatar.setAttribute("data-user", m.from);

            avatar.style.position = "relative";
            avatar.style.overflow = "hidden";
            avatar.style.borderRadius = "8px";

            if (senderAvatar) {
                avatar.innerHTML = `
                    <img
                        src="${senderAvatar}"
                        style="
                            width:100%;
                            height:100%;
                            object-fit:cover;
                            border-radius:8px;
                            position:absolute;
                            inset:0;
                        "
                    >
                `;
            }

            const content = document.createElement("div");
            content.style.maxWidth = "100%";

            const sender = document.createElement("div");
            sender.className = "msg-sender";
            sender.innerText = m.from;

            const bubble = document.createElement("div");
            bubble.className = "msg-bubble";

            // =========================
            // HTML sécurisé
            // =========================

            let html = "";

            if (text) {

                const isHtml =
                    /<[^>]+>/m.test(text) &&
                    (
                        text.includes("<style") ||
                        text.includes("</") ||
                        text.includes("/>")
                    );

                if (isHtml) {

                    const forbidden =
                        /<script[\s\S]*?>[\s\S]*?<\/script>/gi.test(text) ||
                        /javascript:/gi.test(text) ||
                        /on\w+=/gi.test(text) ||
                        /<iframe/gi.test(text) ||
                        /<object/gi.test(text) ||
                        /<embed/gi.test(text) ||
                        /<link/gi.test(text);

                    if (forbidden) {

                        html = `
                            <div style="
                                color:#ff4d4f;
                                font-size:13px;
                                padding:8px;
                            ">
                                ⚠️ JavaScript interdit
                            </div>
                        `;

                    } else {

                        const iframeId =
                            "html-" +
                            Date.now() +
                            Math.random().toString(36).slice(2);

                        html = `
                            <iframe
                                id="${iframeId}"
                                sandbox=""
                                style="
                                    width:100%;
                                    min-height:80px;
                                    border:none;
                                    border-radius:12px;
                                    background:#fff;
                                "
                            ></iframe>
                        `;

                        setTimeout(() => {

                            const iframe =
                                document.getElementById(iframeId);

                            if (iframe) {

                                iframe.srcdoc = `
                                    <!DOCTYPE html>
                                    <html>
                                    <head>
                                        <meta charset="UTF-8">

                                        <meta
                                            name="viewport"
                                            content="width=device-width,initial-scale=1"
                                        >

                                        <style>
                                            *{
                                                box-sizing:border-box;
                                            }

                                            body{
                                                margin:0;
                                                padding:10px;
                                                overflow-x:hidden;
                                                word-break:break-word;
                                                font-family:sans-serif;
                                            }
                                        </style>
                                    </head>

                                    <body>
                                        ${text}
                                    </body>
                                    </html>
                                `;

                                iframe.onload = () => {

                                    try {

                                        const h =
                                            iframe.contentDocument.body.scrollHeight;

                                        iframe.style.height =
                                            Math.min(
                                                Math.max(h + 20, 80),
                                                500
                                            ) + "px";

                                    } catch {}
                                };
                            }

                        }, 50);
                    }

                } else {

                    html = `<span>${escapeHtml(text)}</span>`;
                }
            }

            // ===== Fichier =====
            if (m.file) {

                if (m.fileType === "image") {

                    html += `
                        <br>

                        <img
                            src="${m.file}"
                            style="
                                max-width:200px;
                                border-radius:12px;
                                margin-top:8px;
                                display:block;
                            "
                        >
                    `;

                } else {

                    html += `
                        <br>

                        <video
                            controls
                            style="
                                max-width:200px;
                                border-radius:12px;
                                margin-top:8px;
                                display:block;
                            "
                        >
                            <source src="${m.file}">
                        </video>
                    `;
                }
            }

            // ===== Heure + Vu + Suppression =====
            html += `
                <div style="
                    display:flex;
                    align-items:center;
                    gap:8px;
                    margin-top:6px;
                    justify-content:${isMe ? "flex-end" : "flex-start"};
                ">
                    <small style="
                        color:#6b7280;
                        font-size:11px;
                    ">
                        ${m.time || ""}
                    </small>

                    ${isMe
                        ? `
                            <small class="msg-seen" style="
                                font-size:11px;
                                color:#6b7280;
                            ">
                                ✓ Envoyé
                            </small>
                        `
                        : ""
                    }

                    ${isMe
                        ? `
                            <button
                                class="del-btn"
                                data-id="${m.id || tempId}"
                                onclick="deleteMsg(this)"
                                style="
                                    background:none;
                                    border:none;
                                    cursor:pointer;
                                    font-size:13px;
                                    opacity:0.5;
                                    padding:0 2px;
                                "
                                title="Supprimer"
                            >
                                🗑️
                            </button>
                        `
                        : ""
                    }
                </div>
            `;

            bubble.innerHTML = html;

            content.appendChild(sender);
            content.appendChild(bubble);

            msgEl.appendChild(avatar);
            msgEl.appendChild(content);

            messages.appendChild(msgEl);

            messagesArea.scrollTop =
                messagesArea.scrollHeight;
        }
    }

    function escapeHtml(text) {

        const d = document.createElement("div");

        d.textContent = text;

        return d.innerHTML;
    }
}

// ===== Suppression =====
function deleteMsg(btn) {

    const id = btn.getAttribute("data-id");

    if (!id || id.startsWith("tmp-")) return;

    socket.emit("deleteMessage", id);
}

function logout() {

    localStorage.removeItem("user");
    localStorage.removeItem("toUser");

    window.location.href = "index.html";
}