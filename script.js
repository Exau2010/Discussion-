const socket = io();

// ===== Auth & navigation =====
if(!localStorage.getItem("user") && !window.location.href.includes("index.html")){
    window.location.href="index.html";
}
const user = localStorage.getItem("user");
if(document.getElementById("user")) document.getElementById("user").innerText = user;
if(document.getElementById("user1")) document.getElementById("user1").innerText = user;

// ===== Unread messages tracker =====
// { senderUsername: count }
let unreadFrom = JSON.parse(localStorage.getItem("unreadFrom") || "{}");

function saveUnread() {
    localStorage.setItem("unreadFrom", JSON.stringify(unreadFrom));
}

function isSmallScreen() {
    return window.innerWidth < 768;
}

// Listen for new message notifications on home/profile pages
socket.on("newMessageNotification", ({ from, to }) => {
    if (to !== user) return;

    // Don't show notification if we are currently chatting with that person
    const currentChat = localStorage.getItem("toUser");
    const onChatPage = document.getElementById("toUser") !== null;
    if (onChatPage && currentChat === from) return;

    if (!unreadFrom[from]) unreadFrom[from] = 0;
    unreadFrom[from]++;
    saveUnread();

    if (isSmallScreen()) {
        // Show red dot on the user card in home
        updateRedDot(from);
    } else {
        // Show notification in right panel
        addNotificationPanel(from);
    }
});

// Clear unread when messages are read
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
            position:absolute;top:4px;right:4px;width:12px;height:12px;
            background:#ff4d6d;border-radius:50%;border:2px solid #080a0c;
            animation:dotPulse 0.4s ease;z-index:10;
        `;
        card.style.position = "relative";
        card.appendChild(dot);
    });
}

function removeRedDot(fromUser) {
    document.querySelectorAll(`.red-dot[data-user="${fromUser}"]`).forEach(d => {
        d.style.transition = "opacity 0.3s";
        d.style.opacity = "0";
        setTimeout(() => d.remove(), 300);
    });
}

function addNotificationPanel(fromUser) {
    const panel = document.querySelector(".right-panel");
    if (!panel) return;

    // Remove "aucune notification" placeholder
    const empty = panel.querySelector(".notif-empty");
    if (empty) empty.remove();

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
        display:flex;align-items:center;gap:10px;padding:12px;
        background:rgba(255,255,255,0.04);border:1px solid rgba(255,77,109,0.2);
        border-radius:12px;margin-bottom:8px;cursor:pointer;
        animation:slideIn 0.3s ease;
    `;
    item.innerHTML = `
        <div style="width:8px;height:8px;border-radius:50%;background:#ff4d6d;flex-shrink:0;"></div>
        <div style="flex:1;font-size:13px;color:#e8eaed;">
            <strong style="color:#00e5a0;">${fromUser}</strong> vous a envoyé un message
        </div>
        <span class="notif-count" style="background:#ff4d6d;color:#fff;border-radius:20px;padding:2px 8px;font-size:11px;font-weight:700;">${unreadFrom[fromUser]}</span>
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
        item.style.transition = "opacity 0.3s";
        item.style.opacity = "0";
        setTimeout(() => item.remove(), 300);
    }
    // Restore empty placeholder if no more notifs
    const panel = document.querySelector(".right-panel");
    if (panel && panel.querySelectorAll(".notif-item").length === 0) {
        const empty = document.createElement("div");
        empty.className = "notif-empty";
        empty.innerHTML = `<div class="notif-icon">🔔</div>Aucune notification`;
        empty.style.cssText = "text-align:center;padding:40px 20px;color:#6b7280;font-size:13px;";
        panel.appendChild(empty);
    }
}

// Restore unread dots/notifs on page load
function restoreUnread() {
    Object.keys(unreadFrom).forEach(fromUser => {
        if (unreadFrom[fromUser] > 0) {
            if (isSmallScreen()) {
                updateRedDot(fromUser);
            } else {
                addNotificationPanel(fromUser);
            }
        }
    });
}

function logout(){
    localStorage.removeItem("user");
    localStorage.removeItem("toUser");
    localStorage.removeItem("selectedUser");
    window.location.href="index.html";
}

function goHome(){ window.location.href="home.html"; }

// ===== Connexion / inscription =====
async function login(){
    let username = document.getElementById("username").value.trim();
    let password = document.getElementById("password").value;
    const res = await fetch("/api/login",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({username,password})
    });
    const data = await res.json();
    if(data.error) return alert(data.error);
    localStorage.setItem("user", username);
    if (data.isAdmin) {
        localStorage.setItem("isAdmin", "true");
        window.location.href="home.html";
    } else {
        localStorage.removeItem("isAdmin");
        window.location.href="home.html";
    }
}

function regis(){
    const prest = document.getElementById("prest"); if(prest) prest.innerText = "Veuillez vous inscrire";
    const register = document.getElementById("register-section"); if(register) register.style.display = "block";
    const loginSec = document.getElementById("login-section"); if(loginSec) loginSec.style.display = "none";
}

function anul(){
    const prest = document.getElementById("prest"); if(prest) prest.innerText = "Bienvenue sur notre plateforme";
    const register = document.getElementById("register-section"); if(register) register.style.display = "none";
    const loginSec = document.getElementById("login-section"); if(loginSec) loginSec.style.display = "block";
}

async function register(){
    let username = document.getElementById("username").value;
    let password = document.getElementById("password").value;
    let email = document.getElementById("email").value.trim().toLowerCase();
    const res = await fetch("/api/register",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({username,password,email})
    });
    const data = await res.json();
    if(data.error) return alert(data.error);
    alert("Compte créé !");
    window.location.href="index.html";
}

// ===== Delete own account (from user.html) =====
async function deleteOwnAccount(){
    const confirmed = confirm("Voulez-vous vraiment supprimer votre compte ? Cette action est irréversible.");
    if (!confirmed) return;
    const res = await fetch("/api/delete-account", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ username: user })
    });
    const data = await res.json();
    if (data.error) return alert(data.error);
    localStorage.removeItem("user");
    localStorage.removeItem("toUser");
    localStorage.removeItem("selectedUser");
    localStorage.removeItem("isAdmin");
    localStorage.removeItem("unreadFrom");
    window.location.href = "index.html";
}

// ===== Admin: delete user account =====
async function adminDeleteUser(targetUsername){
    const confirmed = confirm(`Supprimer le compte de "${targetUsername}" ? Cette action est irréversible.`);
    if (!confirmed) return;
    const res = await fetch("/api/admin/delete-user", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ adminUsername: user, targetUsername })
    });
    const data = await res.json();
    if (data.error) return alert(data.error);
}

// ===== Home page : liste utilisateurs =====
const isAdmin = localStorage.getItem("isAdmin") === "true";

if(document.getElementById("userList")){
    socket.emit("getUsers");

    // Add keyframes for animations
    const style = document.createElement("style");
    style.textContent = `
        @keyframes dotPulse { from{transform:scale(0);opacity:0} to{transform:scale(1);opacity:1} }
        @keyframes slideIn { from{opacity:0;transform:translateX(10px)} to{opacity:1;transform:translateX(0)} }
    `;
    document.head.appendChild(style);

    socket.on("users", users => {
        const list = document.getElementById("userList");
        list.innerHTML="";
        users.filter(u => u.username !== user).forEach(u => {
            const li = document.createElement("li");
            li.className = "li";
            const pro = document.createElement("div");
            pro.className = "pro";
            pro.setAttribute("data-username", u.username);

            const button = document.createElement("button");
            button.innerText = "Voir le profil";
            li.innerText = u.username;

            const goToProfile = () => {
                localStorage.setItem("selectedUser", u.username);
                window.location.href = "profile.html";
            };

            pro.addEventListener("click", goToProfile);
            button.addEventListener("click", (e) => {
                e.stopPropagation();
                goToProfile();
            });

            list.appendChild(pro);
            pro.appendChild(li);
            pro.appendChild(button);

            // Admin delete button next to username
            if (isAdmin) {
                const delBtn = document.createElement("button");
                delBtn.innerText = "Supprimer";
                delBtn.className = "admin-delete-btn";
                delBtn.style.cssText = `
                    display:block;margin-top:6px;padding:4px 10px;
                    background:rgba(255,77,109,0.15);border:1px solid rgba(255,77,109,0.4);
                    border-radius:8px;color:#ff4d6d;font-size:11px;cursor:pointer;
                    font-family:'DM Sans',sans-serif;transition:all 0.2s;
                `;
                delBtn.addEventListener("mouseenter", () => { delBtn.style.background = "rgba(255,77,109,0.3)"; });
                delBtn.addEventListener("mouseleave", () => { delBtn.style.background = "rgba(255,77,109,0.15)"; });
                delBtn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    adminDeleteUser(u.username);
                });
                pro.appendChild(delBtn);
            }

            // Restore red dot if unread
            if (unreadFrom[u.username] > 0 && isSmallScreen()) {
                updateRedDot(u.username);
            }
        });

        // Restore notifications on large screens
        if (!isSmallScreen()) {
            restoreUnread();
        }
    });

    // When a user is deleted, refresh the list
    socket.on("userDeleted", deletedUsername => {
        if (deletedUsername === user) {
            // Own account was deleted (by admin)
            localStorage.clear();
            alert("Votre compte a été supprimé par un administrateur.");
            window.location.href = "index.html";
        } else {
            socket.emit("getUsers");
        }
    });
}

if(document.getElementById("mylist")){
    socket.emit("getUsers");
    socket.on("users", users=>{
        const milist = document.getElementById("mylist");
        milist.innerHTML="";
        users.filter(u=>u.username!==user).forEach(u=>{
            const ali=document.createElement("option");
            ali.innerText = u.username;
            ali.addEventListener("click", ()=>{
                localStorage.setItem("selectedUser", u.username);
                window.location.href="profile.html";
            });
            milist.appendChild(ali);
        });
    });
}

// ===== User profile page =====
if(document.getElementById("profileUsername")){
    const profileUser = localStorage.getItem("selectedUser");
    if(!profileUser){
        window.location.href = "home.html";
        throw new Error("Aucun utilisateur sélectionné");
    }
    document.getElementById("profileUsername").innerText = profileUser;
    document.getElementById("profileUsernameDetail").innerText = profileUser;

    socket.emit("getUserStatus", profileUser);
    socket.on("userStatus", data=>{
        if(data.username === profileUser){
            document.getElementById("profileStatus").innerText = data.online ? "En ligne" : "Hors ligne";
        }
    });

    document.getElementById("startChatBtn").addEventListener("click", ()=>{
        localStorage.setItem("toUser", profileUser);
        window.location.href="chat.html";
    });
}

// ===== Chat individuel =====
if(document.getElementById("toUser")){
    const toUser = localStorage.getItem("toUser");
    document.getElementById("toUser").innerText = toUser;

    socket.emit("join", user);

    // Mark messages as read when entering chat
    if (unreadFrom[toUser]) {
        delete unreadFrom[toUser];
        saveUnread();
        socket.emit("seen", { from: toUser, to: user });
    }

    const sendBtn = document.getElementById("sendBtn");
    sendBtn.addEventListener("click", sendMessage);
    const messageInput = document.getElementById("message");
    messageInput.addEventListener("keyup",(e)=>{if(e.key==="Enter") sendMessage();});

    function sendMessage(){
        const input=document.getElementById("message");
        if(!input.value) return;
        socket.emit("privateMessage",{from:user,to:toUser,text:input.value});
        input.value="";
    }

    socket.on("privateMessage", m=>{
        if(m.from===user||m.from===toUser) showMessage(m);
        // Mark as seen immediately if we are in chat
        if(m.from===toUser){
            socket.emit("seen", { from: toUser, to: user });
        }
    });

    socket.on("history", msgs=>msgs.forEach(m=>{
        if(m.from===user||m.from===toUser) showMessage(m);
    }));

    function showMessage(m){
        const messages = document.getElementById("messages");
        const messagesArea = document.getElementById("messages-area");

        const msg = document.createElement("div");
        msg.className = "msg " + (m.from === user ? "me" : "them");

        const avatar = document.createElement("div");
        avatar.className = "msg-avatar";

        const content = document.createElement("div");

        const sender = document.createElement("div");
        sender.className = "msg-sender";
        sender.innerText = m.from;

        const bubble = document.createElement("div");
        bubble.className = "msg-bubble";
        bubble.innerText = m.text;

        content.appendChild(sender);
        content.appendChild(bubble);

        msg.appendChild(avatar);
        msg.appendChild(content);

        messages.appendChild(msg);

        messagesArea.scrollTop = messagesArea.scrollHeight;
    }
}
