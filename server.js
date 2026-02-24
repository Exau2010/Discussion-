const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
require("dotenv").config();

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static("."));

// ======================
// MongoDB
// ======================
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log("MongoDB connecté"))
  .catch(err => console.error("Erreur MongoDB :", err));

const User = mongoose.model("User", new mongoose.Schema({
  username: { type: String, unique: true },
  password: String
}));

// ======================
// Auth API
// ======================
// Inscription
app.post("/api/register", async (req, res) => {
  const { username, password } = req.body;
  if(!username || !password) return res.status(400).json({error:"Champs manquants"});
  try {
    const hash = await bcrypt.hash(password,10);
    await User.create({username,password:hash});
    res.json({success:true});
  } catch {
    res.status(400).json({error:"Utilisateur déjà existant"});
  }
});

// Connexion
app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({username});
  if(!user) return res.status(400).json({error:"Compte inexistant"});
  const ok = await bcrypt.compare(password,user.password);
  if(!ok) return res.status(400).json({error:"Mot de passe incorrect"});
  res.json({success:true, username});
});

// ======================
// Socket.io
// ======================
let users = {}; // {username: socket.id}
let messages = []; // liste des messages {id, from, to, text, seen, time}

io.on("connection", socket => {
  const username = socket.handshake.query.username;
  if(username) users[username] = socket.id;

  // Envoyer la liste des utilisateurs
  socket.on("getUsers", async () => {
    const dbUsers = await User.find();
    const list = dbUsers.map(u=>({username:u.username, online: !!users[u.username]}));
    socket.emit("users", list);
  });

  // Historique
  socket.on("history", () => {
    socket.emit("history", messages);
  });

  // Message privé
  socket.on("privateMessage", m => {
    messages.push(m);
    // Envoyer au destinataire si en ligne
    if(users[m.to]) io.to(users[m.to]).emit("privateMessage", m);
    // Envoyer à l'expéditeur
    socket.emit("privateMessage", m);
  });

  // Typing indicator
  socket.on("typing", d => {
    if(users[d.to]) io.to(users[d.to]).emit("typing", d);
  });
  socket.on("stopTyping", d => {
    if(users[d.to]) io.to(users[d.to]).emit("stopTyping", d);
  });

  // Message vu
  socket.on("seen", d => {
    messages.forEach(msg => {
      if(msg.from === d.from && msg.to === d.to) msg.seen = true;
    });
    if(users[d.from]) io.to(users[d.from]).emit("seen", d);
  });

  // Supprimer un message
  socket.on("deleteMessage", id => {
    messages = messages.filter(msg => msg.id !== id);
    io.emit("deleteMessage", id);
  });

  // Disconnect
  socket.on("disconnect", () => {
    for(const u in users){
      if(users[u] === socket.id) delete users[u];
    }
  });
});

// ======================
// Port
// ======================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("Serveur lancé sur le port "+PORT));
