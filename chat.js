// =========================
// chat.js — JEXREY (Mis à jour avec stickers + réactions)
// =========================

const socket = io({ query: { username: localStorage.getItem("user") } });

const user = localStorage.getItem("user");
if (!user) location.href = "index.html";

let selectedFile = null;
let selectedType = null;

if (document.getElementById("toUser")) {

    const toUser = localStorage.getItem("toUser");
    if (!toUser) location.href = "home.html";

    document.getElementById("toUser").innerText = toUser;

    socket.on("connect", () => {
        socket.emit("join", user);
        socket.emit("getHistory", { from: user, to: toUser });
    });

    if (socket.connected) {
        socket.emit("join", user);
        socket.emit("getHistory", { from: user, to: toUser });
    }

    // Effacer les notifications non-lues pour cette conversation
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
    msgInput.onkeydown = e => { if (e.key === "Enter") sendMessage(); };

    // ===== Typing =====
    msgInput.oninput = () => {
        socket.emit("typing", { from: user, to: toUser });
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => {
            socket.emit("stopTyping", { from: user, to: toUser });
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

        const isSticker = text.startsWith("__sticker__");
        const actualText = isSticker ? text : text;

        const msg = {
            id:       tempId,
            from:     user,
            to:       toUser,
            text:     actualText,
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

    // ===== Confirmation serveur =====
    socket.on("messageConfirmed", ({ tempId, msg }) => {
        const el = document.getElementById("msg-" + tempId);
        if (el) {
            el.id = "msg-" + msg.id;
            const delBtn = el.querySelector(".del-btn");
            if (delBtn) delBtn.setAttribute("data-id", msg.id);
        }
    });

    // ===== Réception message =====
    socket.on("privateMessage", m => {
        if (m.from === user) return;
        showMessage(m);
        socket.emit("seen", { from: toUser, to: user });
    });

    // ===== Historique =====
    socket.on("history", msgs => {
        const container = document.getElementById("messages");
        if (container) container.innerHTML = "";
        msgs.forEach(m => showMessage(m));
        socket.emit("seen", { from: toUser, to: user });
    });

    // ===== Typing indicators =====
    socket.on("typing", d => {
        if (d.from === toUser) typingStatus.innerText = `${toUser} écrit...`;
    });

    socket.on("stopTyping", d => {
        if (d.from === toUser) typingStatus.innerText = "En ligne";
    });

    // ===== Seen =====
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

    // ===== Edition message =====
    socket.on("messageEdited", ({ id, newText }) => {
        const el = document.getElementById("msg-" + id);
        if (!el) return;
        const textSpan = el.querySelector(".msg-text");
        if (textSpan) {
            textSpan.innerHTML = newText;
            const editedMark = el.querySelector(".edited-mark");
            if (!editedMark) {
                const mark = document.createElement("span");
                mark.className = "edited-mark";
                mark.style.cssText = "font-size:10px;color:#6b7280;margin-left:4px;";
                mark.textContent = "(modifié)";
                textSpan.after(mark);
            }
        }
    });

    // ===== Panel gauche : liste des utilisateurs =====
    socket.on("users", users => {
        const listpart = document.getElementById("listpart");
        if (!listpart) return;
        listpart.innerHTML = "";

        users.filter(u => u.username !== user).forEach(u => {
            const li = document.createElement("li");
            li.className = "partner-item";
            li.style.cursor = "pointer";
            li.innerHTML = `
                <div class="partner-avatar" style="position:relative;">
                    ${u.online
                        ? `<div class="dot" style="position:absolute;bottom:-1px;right:-1px;width:10px;height:10px;border-radius:50%;background:#22c55e;border:2px solid #080a0c;"></div>`
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

    // ===== Affichage d'un message =====
    function showMessage(m, tempId) {
        const existingId = tempId || m.id;
        if (document.getElementById("msg-" + existingId)) return;

        const isMe = m.from === user;

        if (
            (m.from === user && m.to === toUser) ||
            (m.from === toUser && m.to === user)
        ) {
            const messages     = document.getElementById("messages");
            const messagesArea = document.getElementById("messages-area");

            const msgEl = document.createElement("div");
            msgEl.id = "msg-" + (tempId || m.id);

            const text = m.text || "";

            // Sticker check
            if (text.startsWith("__sticker__")) {
                const stickerContent = text.replace("__sticker__", "");
                msgEl.className = "msg " + (isMe ? "me" : "them");
                msgEl.style.maxWidth = "none";

                const stickerSpan = document.createElement("span");
                stickerSpan.className = "msg-sticker";
                stickerSpan.textContent = stickerContent;
                stickerSpan.style.textAlign = isMe ? "right" : "left";
                stickerSpan.style.display = "block";

                const timeRow = document.createElement("div");
                timeRow.style.cssText = `display:flex;align-items:center;gap:6px;margin-top:4px;justify-content:${isMe ? "flex-end" : "flex-start"};`;
                timeRow.innerHTML = `
                    <small style="color:#6b7280;font-size:11px;">${m.time || ""}</small>
                    ${isMe ? `<small class="msg-seen" style="font-size:11px;color:#6b7280;">✓ Envoyé</small>` : ""}
                    ${isMe ? `<button class="del-btn" data-id="${m.id || tempId}" onclick="deleteMsg(this)" style="background:none;border:none;cursor:pointer;font-size:13px;opacity:0.5;padding:0 2px;">🗑️</button>` : ""}
                `;

                msgEl.appendChild(stickerSpan);
                msgEl.appendChild(timeRow);

                messages.appendChild(msgEl);
                messagesArea.scrollTop = messagesArea.scrollHeight;
                return;
            }

            // Reaction check (single or double emoji)
            const isReaction = /^[\u{1F300}-\u{1FFFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\uFE0F\u200D]+$/u.test(text) && text.length <= 8;

            msgEl.className = "msg " + (isMe ? "me" : "them");

            const avatar = document.createElement("div");
            avatar.className = "msg-avatar";

            const content = document.createElement("div");
            content.style.maxWidth = "100%";

            const sender = document.createElement("div");
            sender.className = "msg-sender";
            sender.innerText = m.from;

            const bubble = document.createElement("div");

            if (isReaction) {
                bubble.innerHTML = `<span class="msg-reaction">${text}</span>`;
                bubble.style.cssText = "background:none;border:none;padding:0 8px;";
            } else {
                bubble.className = "msg-bubble";
                const msgId = m.id || tempId;

                let mediaHtml = "";
                if (m.file) {
                    if (m.fileType === "image") {
                        mediaHtml = `<br><img src="${m.file}" style="max-width:200px;border-radius:12px;margin-top:8px;display:block;">`;
                    } else {
                        mediaHtml = `<br><video controls style="max-width:200px;border-radius:12px;margin-top:8px;display:block;"><source src="${m.file}"></video>`;
                    }
                }

                bubble.innerHTML = `
                    <span class="msg-text">${text || ""}</span>${m.edited ? '<span class="edited-mark" style="font-size:10px;color:#6b7280;margin-left:4px;">(modifié)</span>' : ""}
                    ${mediaHtml}
                    <div style="display:flex;align-items:center;gap:8px;margin-top:6px;justify-content:${isMe ? "flex-end" : "flex-start"};">
                        <small class="msg-time" data-ts="${Date.now()}" style="color:#6b7280;font-size:11px;">${m.time || ""}</small>
                        ${isMe ? `<small class="msg-seen" style="font-size:11px;color:#6b7280;">✓ Envoyé</small>` : ""}
                        ${isMe ? `<button class="edit-btn" data-id="${msgId}" onclick="startEdit(this)" style="background:none;border:none;cursor:pointer;font-size:12px;opacity:0.5;padding:0 2px;" title="Modifier">✏️</button>` : ""}
                        ${isMe ? `<button class="del-btn" data-id="${msgId}" onclick="deleteMsg(this)" style="background:none;border:none;cursor:pointer;font-size:13px;opacity:0.5;padding:0 2px;" title="Supprimer">🗑️</button>` : ""}
                    </div>
                `;
            }

            content.appendChild(sender);
            content.appendChild(bubble);
            msgEl.appendChild(avatar);
            msgEl.appendChild(content);

            messages.appendChild(msgEl);
            messagesArea.scrollTop = messagesArea.scrollHeight;
        }
    }

    function escapeHtml(text) {
        const d = document.createElement("div");
        d.textContent = text;
        return d.innerHTML;
    }
}

// ===== Edition =====
function startEdit(btn) {
    const id = btn.getAttribute("data-id");
    if (!id || id.startsWith("tmp-")) return;
    const el = document.getElementById("msg-" + id);
    if (!el) return;
    const textSpan = el.querySelector(".msg-text");
    if (!textSpan) return;

    const current = textSpan.innerHTML;
    const input = document.createElement("input");
    input.value = current;
    input.style.cssText = "width:100%;background:rgba(255,255,255,0.08);border:1px solid rgba(0,229,160,0.4);border-radius:8px;color:#e8eaed;font-family:inherit;font-size:14px;padding:6px 10px;outline:none;";

    const confirmBtn = document.createElement("button");
    confirmBtn.textContent = "✓";
    confirmBtn.style.cssText = "background:rgba(0,229,160,0.15);border:1px solid rgba(0,229,160,0.4);border-radius:6px;color:#00e5a0;cursor:pointer;padding:4px 10px;margin-left:6px;font-size:13px;";

    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = "✕";
    cancelBtn.style.cssText = "background:none;border:1px solid rgba(255,255,255,0.1);border-radius:6px;color:#6b7280;cursor:pointer;padding:4px 10px;margin-left:4px;font-size:13px;";

    const editWrap = document.createElement("div");
    editWrap.style.cssText = "display:flex;align-items:center;margin-top:4px;";
    editWrap.appendChild(input);
    editWrap.appendChild(confirmBtn);
    editWrap.appendChild(cancelBtn);

    textSpan.replaceWith(editWrap);

    function confirm() {
        const newText = input.value.trim();
        if (!newText) return;
        socket.emit("editMessage", { id, newText });
        const span = document.createElement("span");
        span.className = "msg-text";
        span.innerHTML = newText;
        editWrap.replaceWith(span);
    }

    function cancel() {
        const span = document.createElement("span");
        span.className = "msg-text";
        span.innerHTML = current;
        editWrap.replaceWith(span);
    }

    confirmBtn.addEventListener("click", confirm);
    cancelBtn.addEventListener("click", cancel);
    input.addEventListener("keydown", e => {
        if (e.key === "Enter") confirm();
        if (e.key === "Escape") cancel();
    });
    input.focus();
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
