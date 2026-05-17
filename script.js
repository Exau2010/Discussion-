const socket = io();

// ===== Auth & navigation =====
if(!localStorage.getItem("user") && !window.location.href.includes("index.html")){
    window.location.href="index.html";
}
const user = localStorage.getItem("user");
if(document.getElementById("user")) document.getElementById("user").innerText = user;
document.getElementById("user1").innerText = user;



function logout(){
    localStorage.removeItem("user");
    localStorage.removeItem("toUser");
    localStorage.removeItem("selectedUser");
    window.location.href="index.html";
}

function goHome(){ window.location.href="home.html"; }

// ===== Connexion / inscription =====
async function login(){
    let username = document.getElementById("username").value;
    let password = document.getElementById("password").value;
    const res = await fetch("/api/login",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({username,password})
    });
    const data = await res.json();
    if(data.error) return alert(data.error);
    localStorage.setItem("user", username);
    window.location.href="home.html";
}

function regis(){
    const prest = document.getElementById("prest").innerText = "Veuillez vous inscrire";
    const inp = document.getElementById("inp").innerText = "Inscription";
    const register = document.getElementById("register").style.display = "block";
    const regis = document.getElementById("regis").style.display = "none";
    const login = document.getElementById("login").style.display = "none";
    const anul = document.getElementById("anul").style.display = "block";
}

function anul(){
    const prest = document.getElementById("prest").innerText = "Bienvenue sur notre plateforme";
    const inp = document.getElementById("inp").innerText = "Connectez-vous";
    const register = document.getElementById("register").style.display = "none";
    const regis = document.getElementById("regis").style.display = "block";
    const login = document.getElementById("login").style.display = "block";
    const anul = document.getElementById("anul").style.display = "none";
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

// ===== Home page : liste utilisateurs =====
if(document.getElementById("userList")){
    socket.emit("getUsers"); 
    socket.on("users", users=>{
        const list = document.getElementById("userList");
        list.innerHTML="";
        users.filter(u=>u.username!==user).forEach(u=>{
            const li=document.createElement("li");
            li.className = "li";
            const pro=document.createElement("div");
            pro.className = "pro";
            const button=document.createElement("button");
            button.innerText="Voir le profil";
            li.innerText = u.username;
            const goToProfile = () => {
                localStorage.setItem("selectedUser", u.username);
                window.location.href = "profile.html";
            }
            /** iframe.background-url à definir **/
            pro.addEventListener("click", goToProfile);
            button.addEventListener("click", (e) => {
                e.stopPropagation();
                goToProfile();
            });
            list.appendChild(pro);
            pro.appendChild(li);
            pro.appendChild(button);
        });
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
