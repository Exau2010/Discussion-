const socket = io({query:{username:localStorage.getItem("user")}});
const user = localStorage.getItem("user");
if(!user) location.href="index.html";

if(document.getElementById("toUser")){
  const toUser = localStorage.getItem("toUser");
  document.getElementById("toUser").innerText = toUser;

  socket.emit("join", user);

  const msgInput = document.getElementById("message");
  const sendBtn = document.getElementById("sendBtn");
  const messagesDiv = document.getElementById("messages");
  let typingTimeout;

  msgInput.oninput = ()=>{
    socket.emit("typing",{from:user,to:toUser});
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(()=>{socket.emit("stopTyping",{from:user,to:toUser})},1500);
  };

  sendBtn.onclick = sendMessage;
  msgInput.onkeyup = e=>{if(e.key==="Enter") sendMessage()};

  function sendMessage(){
    const text = msgInput.value.trim();
    if(!text) return;
    const msg = {id:Date.now(),from:user,to:toUser,text,seen:false,time:new Date().toLocaleTimeString().slice(0,5)};
    socket.emit("privateMessage", msg);
    msgInput.value="";
  }

  socket.on("privateMessage", m=>showMessage(m));
  socket.on("history", msgs=>msgs.forEach(m=>showMessage(m)));
  socket.on("typing", d=>{if(d.from===toUser) document.getElementById("typingStatus").innerText=toUser+" est en train d'écrire...";});
  socket.on("stopTyping", d=>{if(d.from===toUser) document.getElementById("typingStatus").innerText="";});
  socket.on("seen", d=>{document.querySelectorAll(".seen").forEach(e=>e.innerText="Vu à "+new Date().toLocaleTimeString().slice(0,5))});
  socket.on("deleteMessage", id=>{const el=document.getElementById("msg-"+id);if(el) el.remove()});

  function showMessage(m){
    if((m.from===user && m.to===toUser)||(m.from===toUser && m.to===user)){
      const div=document.createElement("div");
      div.id="msg-"+m.id;
      div.classList.add("message");
      div.classList.add(m.from===user?"sent":"received");
      div.innerHTML = `<b>${m.from}</b> : ${m.text}<br><small class="seen">${m.from===user && m.seen ? "Vu à "+m.time : ""}</small>${m.from===user ? `<button onclick="deleteMsg(${m.id})">🗑️</button>`:""}`;
      messagesDiv.appendChild(div);
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
      if(m.from===toUser) socket.emit("seen",{from:toUser,to:user});
    }
  }
}

function deleteMsg(id){socket.emit("deleteMessage",id);}
function logout(){localStorage.removeItem("user"); localStorage.removeItem("toUser"); window.location.href="index.html";}
