// =========================
// chat.js — JEXREY (rendu HTML, 20 derniers messages, chargement rapide)
// =========================

const socket = io({ query: { username: localStorage.getItem("user") } });

const user = localStorage.getItem("user");
if (!user) location.href = "index.html";

let selectedFile = null;
let selectedType = null;
let chatAvatarCache = {};
let historyLoaded = false;

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

socket.on("avatarUpdated", ({ username, avatar }) => {
    chatAvatarCache[username] = avatar;
    document.querySelectorAll(`.msg-avatar[data-user="${username}"]`).forEach(el => {
        const img = el.querySelector('img');
        if (img) { img.src = avatar; img.style.display = avatar ? 'block' : 'none'; }
    });
    const partnerItem = document.querySelector(`.partner-item[data-username="${username}"] .partner-avatar img`);
    if (partnerItem) { partnerItem.src = avatar; partnerItem.style.display = avatar ? 'block' : 'none'; }
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

    // Charger l'historique HTTP immédiatement (avant même que le socket soit prêt)
    // pour un affichage ultra-rapide
    (async function preloadHistory() {
        try {
            const r = await fetch(`/api/messages?from=${encodeURIComponent(user)}&to=${encodeURIComponent(toUser)}`);
            if (r.ok) {
                const msgs = await r.json();
                if (!historyLoaded && msgs.length > 0) {
                    const container = document.getElementById("messages");
                    if (container) container.innerHTML = "";
                    // Charger les avatars en batch d'abord
                    const authors = [...new Set(msgs.map(m => m.from))];
                    const uncached = authors.filter(a => !(a in chatAvatarCache));
                    if (uncached.length > 0) {
                        try {
                            const avR = await fetch('/api/avatars/batch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usernames: uncached }) });
                            const avD = await avR.json();
                            uncached.forEach(a => { chatAvatarCache[a] = avD[a] || ''; });
                        } catch {}
                    }
                    for (const m of msgs) await showMessage(m);
                    historyLoaded = true;
                    hideLoader();
                }
            }
        } catch {}
    })();

    socket.on("connect", () => {
        socket.emit("join", user);
        socket.emit("getHistory", { from: user, to: toUser });
    });

    setTimeout(() => hideLoader(), 4000);

    if (socket.connected) {
        socket.emit("join", user);
        socket.emit("getHistory", { from: user, to: toUser });
    }

    // Effacer les notifications pour cette conversation
    let unreadFrom = JSON.parse(localStorage.getItem("unreadFrom") || "{}");
    if (unreadFrom[toUser]) {
        delete unreadFrom[toUser];
        localStorage.setItem("unreadFrom", JSON.stringify(unreadFrom));
        socket.emit("seen", { from: toUser, to: user });
    }

    const msgInput     = document.getElementById("message");
    const sendBtn      = document.getElementById("sendBtn");
    const typingStatus = document.getElementById("typingStatus");
    let typingTimeout;

    sendBtn.onclick    = sendMessage;
    msgInput.onkeydown = e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } };

    // Typing
    msgInput.oninput = () => {
        socket.emit("typing", { from: user, to: toUser });
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => {
            socket.emit("stopTyping", { from: user, to: toUser });
        }, 1500);
    };

    // Fichier
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

    // Envoi
    function sendMessage() {
        const text = msgInput.value.trim();
        if (!text && !selectedFile) return;

        const tempId = "tmp-" + Date.now();
        const msg = {
            id:       tempId,
            from:     user,
            to:       toUser,
            text,
            file:     selectedFile,
            fileType: selectedType,
            seen:     false,
            time:     new Date().toLocaleTimeString("fr-FR").slice(0, 5)
        };

        showMessage(msg, tempId);
        socket.emit("privateMessage", msg);

        msgInput.value  = "";
        selectedFile    = null;
        selectedType    = null;
    }

    // Confirmation serveur
    socket.on("messageConfirmed", ({ tempId, msg }) => {
        const el = document.getElementById("msg-" + tempId);
        if (el) {
            el.id = "msg-" + msg.id;
            const delBtn = el.querySelector(".del-btn");
            if (delBtn) delBtn.setAttribute("data-id", msg.id);
        }
    });

    // Réception message
    socket.on("privateMessage", m => {
        if (m.from === user) return;
        showMessage(m);
        socket.emit("seen", { from: toUser, to: user });
    });

    // Historique via socket (si HTTP a déjà chargé, on skip)
    socket.on("history", async msgs => {
        if (historyLoaded) return; // déjà chargé via HTTP
        const container = document.getElementById("messages");
        if (container) container.innerHTML = "";

        // Batch avatars
        const authors = [...new Set(msgs.map(m => m.from))];
        const uncached = authors.filter(a => !(a in chatAvatarCache));
        if (uncached.length > 0) {
            try {
                const avR = await fetch('/api/avatars/batch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usernames: uncached }) });
                const avD = await avR.json();
                uncached.forEach(a => { chatAvatarCache[a] = avD[a] || ''; });
            } catch {}
        }

        for (const m of msgs) await showMessage(m);
        historyLoaded = true;
        socket.emit("seen", { from: toUser, to: user });
        hideLoader();
    });

    // Typing indicators
    socket.on("typing",     d => { if (d.from === toUser) typingStatus.innerText = `${toUser} écrit...`; });
    socket.on("stopTyping", d => { if (d.from === toUser) typingStatus.innerText = "En ligne"; });

    // Seen
    socket.on("seen", () => {
        document.querySelectorAll(".msg-seen").forEach(el => {
            el.innerText = "✓✓ Vu";
            el.style.color = "#00e5a0";
        });
    });

    // Suppression
    socket.on("deleteMessage", id => {
        const el = document.getElementById("msg-" + id);
        if (el) {
            el.style.opacity = "0";
            el.style.transition = "opacity 0.3s";
            setTimeout(() => el.remove(), 300);
        }
    });

    // Liste utilisateurs (panel gauche)
    socket.on("users", async (users) => {
        const listpart = document.getElementById("listpart");
        if (!listpart) return;
        listpart.innerHTML = "";
        const usernames = users.filter(u => u.username !== user).map(u => u.username);
        const uncached = usernames.filter(u => !(u in chatAvatarCache));
        if (uncached.length > 0) {
            try {
                const r = await fetch('/api/avatars/batch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usernames: uncached }) });
                const d = await r.json();
                uncached.forEach(u => { chatAvatarCache[u] = d[u] || ''; });
            } catch { uncached.forEach(u => { chatAvatarCache[u] = ''; }); }
        }
        users.filter(u => u.username !== user).forEach(u => {
            const av = chatAvatarCache[u.username] || '';
            const li = document.createElement("li");
            li.className = "partner-item";
            li.setAttribute("data-username", u.username);
            li.style.cursor = "pointer";
            li.innerHTML = `
                <div class="partner-avatar" style="position:relative;overflow:hidden;border-radius:10px;">
                    <img src="${av}" alt="" style="${av ? '' : 'display:none;'}width:100%;height:100%;object-fit:cover;position:absolute;inset:0;">
                    ${u.online ? `<div class="dot" style="position:absolute;bottom:-1px;right:-1px;width:10px;height:10px;border-radius:50%;background:#22c55e;border:2px solid #080a0c;z-index:2;"></div>` : ""}
                </div>
                <div>
                    <div class="partner-name">${u.username}</div>
                    <div class="partner-sub">${u.online ? "En ligne" : "Hors ligne"}</div>
                </div>
            `;
            li.addEventListener("click", () => { localStorage.setItem("toUser", u.username); location.reload(); });
            listpart.appendChild(li);
        });
    });

    socket.emit("getUsers");

    // ===== Affichage message =====
    async function showMessage(m, tempId) {
        const existingId = tempId || m.id;
        if (document.getElementById("msg-" + existingId)) return;

        const isMe = m.from === user;
        if (!((m.from === user && m.to === toUser) || (m.from === toUser && m.to === user))) return;

        const messages     = document.getElementById("messages");
        const messagesArea = document.getElementById("messages-area");

        const msgEl = document.createElement("div");
        msgEl.id = "msg-" + (tempId || m.id);

        const text = m.text || "";
        const senderAvatar = await getChatAvatar(m.from);

        // ===== STICKER =====
        if (text.startsWith("__sticker__")) {
            const stickerContent = text.replace("__sticker__", "");
            msgEl.className = "msg " + (isMe ? "me" : "them");
            msgEl.style.maxWidth = "none";

            const avatarEl = document.createElement("div");
            avatarEl.className = "msg-avatar"; avatarEl.setAttribute("data-user", m.from);
            avatarEl.style.cssText = "position:relative;overflow:hidden;border-radius:8px;";
            if (senderAvatar) avatarEl.innerHTML = `<img src="${senderAvatar}" style="width:100%;height:100%;object-fit:cover;border-radius:8px;position:absolute;inset:0;">`;

            const stickerSpan = document.createElement("span");
            stickerSpan.className = "msg-sticker";
            stickerSpan.textContent = stickerContent;
            stickerSpan.style.cssText = `text-align:${isMe ? "right" : "left"};display:block;`;

            const timeRow = document.createElement("div");
            timeRow.style.cssText = `display:flex;align-items:center;gap:6px;margin-top:4px;justify-content:${isMe ? "flex-end" : "flex-start"};`;
            timeRow.innerHTML = `
                <small style="color:#6b7280;font-size:11px;">${m.time || ""}</small>
                ${isMe ? `<small class="msg-seen" style="font-size:11px;color:#6b7280;">✓ Envoyé</small>` : ""}
                ${isMe ? `<button class="del-btn" data-id="${m.id || tempId}" onclick="deleteMsg(this)" style="background:none;border:none;cursor:pointer;font-size:13px;opacity:0.5;padding:0 2px;">🗑️</button>` : ""}
            `;
            msgEl.appendChild(avatarEl); msgEl.appendChild(stickerSpan); msgEl.appendChild(timeRow);
            messages.appendChild(msgEl);
            messagesArea.scrollTop = messagesArea.scrollHeight;
            return;
        }

        // ===== REACTION (emoji seul) =====
        const isReaction = /^[\u{1F300}-\u{1FFFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\uFE0F\u200D]+$/u.test(text) && text.length <= 8;

        msgEl.className = "msg " + (isMe ? "me" : "them");

        const avatar = document.createElement("div");
        avatar.className = "msg-avatar"; avatar.setAttribute("data-user", m.from);
        avatar.style.cssText = "position:relative;overflow:hidden;border-radius:8px;";
        if (senderAvatar) avatar.innerHTML = `<img src="${senderAvatar}" style="width:100%;height:100%;object-fit:cover;border-radius:8px;position:absolute;inset:0;">`;

        const content = document.createElement("div");
        content.style.maxWidth = "100%";

        const sender = document.createElement("div");
        sender.className = "msg-sender"; sender.innerText = m.from;

        const bubble = document.createElement("div");

        if (isReaction) {
            bubble.innerHTML = `<span class="msg-reaction">${text}</span>`;
            bubble.style.cssText = "background:none;border:none;padding:0 8px;";
        } else {
            bubble.className = "msg-bubble";

            // ===== DÉTECTION HTML — rendu dans iframe sécurisée =====
            const isHtml = text && (
                /^\s*<[a-zA-Z]/.test(text) ||
                (text.includes('<') && text.includes('>') && /<\/[a-zA-Z]/.test(text))
            );

            if (isHtml && text) {
                const iframeId = "iframe-" + Date.now() + Math.random().toString(36).slice(2);
                const metaViewport = '<meta name="viewport" content="width=device-width,initial-scale=1">';
                const baseStyle = `<style>
                    * { box-sizing:border-box; margin:0; padding:0; }
                    body {
                        font-family: 'DM Sans', system-ui, sans-serif;
                        font-size: 14px; padding: 10px;
                        background: transparent;
                        color: #e8eaed;
                        overflow-x: hidden;
                        word-break: break-word;
                        line-height: 1.6;
                    }
                    h1,h2,h3,h4,h5,h6 { font-weight:700; line-height:1.3; margin-bottom:8px; }
                    p { margin-bottom:6px; }
                    a { color:#00e5a0; }
                    ul,ol { padding-left:20px; }
                    img { max-width:100%; border-radius:8px; }
                    button {
                        padding:8px 16px; border:none; border-radius:8px;
                        background:#00e5a0; color:#080a0c; font-weight:700;
                        cursor:pointer; font-size:13px;
                    }
                    input,textarea {
                        width:100%; padding:8px 12px; background:rgba(255,255,255,0.06);
                        border:1px solid rgba(255,255,255,0.12); border-radius:8px;
                        color:#e8eaed; font-size:13px; outline:none;
                    }
                    table { width:100%; border-collapse:collapse; }
                    td,th { padding:6px 10px; border:1px solid rgba(255,255,255,0.1); font-size:12px; }
                    th { background:rgba(0,229,160,0.1); color:#00e5a0; }
                    code { background:rgba(255,255,255,0.08); padding:2px 6px; border-radius:4px; font-family:monospace; font-size:12px; }
                    pre { background:rgba(255,255,255,0.06); padding:10px; border-radius:8px; overflow-x:auto; }
                </style>`;
                const safeDoc = metaViewport + baseStyle + text;

                bubble.innerHTML = `
                    <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">
                        <span style="font-size:10px;letter-spacing:1px;text-transform:uppercase;color:#00e5a0;font-weight:600;background:rgba(0,229,160,0.1);padding:2px 8px;border-radius:4px;">⚡ HTML</span>
                        <span style="font-size:10px;color:#6b7280;">rendu live</span>
                    </div>
                    <iframe
                        id="${iframeId}"
                        sandbox="allow-scripts"
                        style="width:100%;min-height:40px;border:1px solid rgba(0,229,160,0.15);border-radius:10px;background:transparent;display:block;"
                        srcdoc=""
                    ></iframe>
                    <div style="display:flex;align-items:center;gap:8px;margin-top:6px;justify-content:${isMe ? "flex-end" : "flex-start"};">
                        <small style="color:#6b7280;font-size:11px;">${m.time || ""}</small>
                        ${isMe ? `<small class="msg-seen" style="font-size:11px;color:#6b7280;">✓ Envoyé</small>` : ""}
                        ${isMe ? `<button class="del-btn" data-id="${m.id || tempId}" onclick="deleteMsg(this)" style="background:none;border:none;cursor:pointer;font-size:13px;opacity:0.5;padding:0 2px;" title="Supprimer">🗑️</button>` : ""}
                    </div>
                `;

                // Injecter et auto-resize
                requestAnimationFrame(() => {
                    const iframe = document.getElementById(iframeId);
                    if (!iframe) return;
                    iframe.srcdoc = safeDoc;
                    iframe.onload = () => {
                        try {
                            const h = iframe.contentDocument.body.scrollHeight;
                            iframe.style.height = Math.min(Math.max(h + 20, 40), 600) + "px";
                        } catch {}
                    };
                });

            } else {
                // ===== TEXTE NORMAL =====
                let html = text ? `<span>${escapeHtml(text)}</span>` : "";
                if (m.file) {
                    if (m.fileType === "image") {
                        html += `<br><img src="${m.file}" style="max-width:200px;border-radius:12px;margin-top:8px;display:block;">`;
                    } else {
                        html += `<br><video controls style="max-width:200px;border-radius:12px;margin-top:8px;display:block;"><source src="${m.file}"></video>`;
                    }
                }
                html += `
                    <div style="display:flex;align-items:center;gap:8px;margin-top:6px;justify-content:${isMe ? "flex-end" : "flex-start"};">
                        <small style="color:#6b7280;font-size:11px;">${m.time || ""}</small>
                        ${isMe ? `<small class="msg-seen" style="font-size:11px;color:#6b7280;">✓ Envoyé</small>` : ""}
                        ${isMe ? `<button class="del-btn" data-id="${m.id || tempId}" onclick="deleteMsg(this)" style="background:none;border:none;cursor:pointer;font-size:13px;opacity:0.5;padding:0 2px;" title="Supprimer">🗑️</button>` : ""}
                    </div>
                `;
                bubble.innerHTML = html;
            }
        }

        content.appendChild(sender);
        content.appendChild(bubble);
        msgEl.appendChild(avatar);
        msgEl.appendChild(content);
        messages.appendChild(msgEl);
        messagesArea.scrollTop = messagesArea.scrollHeight;
    }

    function escapeHtml(text) {
        const d = document.createElement("div");
        d.textContent = text;
        return d.innerHTML;
    }
}

// ===== Loader =====
function hideLoader() {
    const loader = document.getElementById("app-loader");
    if (loader) { loader.classList.add("hidden"); setTimeout(() => loader.remove(), 500); }
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
