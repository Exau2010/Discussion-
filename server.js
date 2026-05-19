server.js

require("dotenv").config();

const express = require("express");

const http = require("http");

const mongoose = require("mongoose");

const bcrypt = require("bcrypt");

const { Server } = require("socket.io");

const app = express();

const server = http.createServer(app);

const io = new Server(server);

app.use(express.json());

app.use(express.static("."));

// ===== MongoDB =====

mongoose.connect(process.env.MONGODB_URI)
.then(() => console.log("MongoDB connecté"))
.catch(err => console.error("Erreur MongoDB :", err));

// ===== Schemas =====

const User = mongoose.model("User", new mongoose.Schema({

username:{
type:String,
unique:true
},

password:String,

online:{
type:Boolean,
default:false
}

}));

const Message = mongoose.model("Message", new mongoose.Schema({

from:String,

to:String,

text:String,

file:String,

fileType:String,

seen:{
type:Boolean,
default:false
},

createdAt:{
type:Date,
default:Date.now,
expires:7*24*60*60
}

}));

// ===== ADMIN =====

const ADMIN_USERNAME = "JEX-EXAU-ARI";

const ADMIN_PASSWORD = "20/10/11";

// ===== REGISTER =====

app.post("/api/register", async (req,res)=>{

let { username, password } = req.body;

if(!username || !password){

return res.json({
error:"Champs manquants"
});

}

try{

const hash = await bcrypt.hash(password,10);

await User.create({
username,
password:hash
});

res.json({
success:true
});

}catch{

res.json({
error:"Utilisateur déjà existant"
});

}

});

// ===== LOGIN =====

app.post("/api/login", async (req,res)=>{

const { username, password } = req.body;

// Admin

if(username === ADMIN_USERNAME && password === ADMIN_PASSWORD){

return res.json({
success:true,
isAdmin:true
});

}

const user = await User.findOne({
username
});

if(!user){

return res.json({
error:"Compte inexistant"
});

}

const ok = await bcrypt.compare(password,user.password);

if(!ok){

return res.json({
error:"Mot de passe incorrect"
});

}

res.json({
success:true,
isAdmin:false
});

});

// ===== SOCKET =====

io.on("connection", socket=>{

socket.on("join", async username=>{

socket.username = username;

await User.updateOne(
{ username },
{ online:true }
);

const users = await User.find(
{},
"username online"
);

io.emit("users",users);

const messages = await Message.find({
$or:[
{ from:username },
{ to:username }
]
}).sort({ createdAt:1 }).lean();

socket.emit("history",messages);

});

socket.on("getUsers", async ()=>{

const users = await User.find(
{},
"username online"
);

socket.emit("users",users);

});

socket.on("privateMessage", async ({ from,to,text })=>{

const msg = await Message.create({
from,
to,
text
});

io.sockets.sockets.forEach(s=>{

if(
s.username === from ||
s.username === to
){

s.emit("privateMessage",msg);

}

});

});

socket.on("disconnect", async ()=>{

if(!socket.username) return;

await User.updateOne(
{ username:socket.username },
{ online:false }
);

const users = await User.find(
{},
"username online"
);

io.emit("users",users);

});

});

const PORT = process.env.PORT || 3000;

server.listen(PORT, ()=>{

console.log(`Serveur lancé sur le port ${PORT}`);

});
