require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(".")); // tous les fichiers sont à la racine

/* ======================
   MongoDB
====================== */
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log("MongoDB connecté"))
  .catch(err => console.error("Erreur MongoDB :", err));

/* ======================
   Schemas
====================== */
const User = mongoose.model("User", new mongoose.Schema({
  username: { type: String, unique: true },
  password: String,
  online: { type: Boolean, default: false }
}));

const Message = mongoose.model("Message", new mongoose.Schema({
  id: Number,
  from: String,
  to: String,
  text: String,
  seen: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  time: String
}));

/* ======================
   Auth API
====================== */
app.post("/api/register", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: "Champs manquants" });

  try {
    const hash = await bcrypt.hash(password, 10);
    await User.create({ username, password: hash });
    res.json({ success: true });
  } catch {
    res.status(400).json({ error: "Utilisateur déjà existant" });
  }
});

app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username });
  if(!user) return res.status(400).json({ error: "Compte inexistant" });

  const ok = await bcrypt.compare(password, user.password);
  if(!ok) return res.status(400).json({ error: "Mot de passe incorrect" });

  user.online = true;
  await user.save();
  res.json({ success: true, username });
});

/* ======================
   Socket.IO
====================== */
let users = {}; // username -> socket.id

io.on("connection", socket => {
  const username = socket.handshake.query.username;
  if(username) users[username] = socket.id;

  // Rejoindre chat
  socket.on("join", user => {
    users[user] = socket.id;
  });

  // Typing indicator
  socket.on("typing", ({ from, to }) => {
    if(users[to]) io.to(users[to]).emit("typing", { from });
  });
  socket.on("stopTyping", ({ from, to }) => {
    if(users[to]) io.to(users[to]).emit("stopTyping", { from });
  });

  // Envoi message privé
  socket.on("privateMessage", async msg => {
    // Sauvegarder en DB
    await Message.create(msg);

    // Envoyer au destinataire si connecté
    if(users[msg.to]) io.to(users[msg.to]).emit("privateMessage", msg);
    // Envoyer à l'expéditeur pour affichage
    socket.emit("privateMessage", msg);
  });

  // Historique
  socket.on("getHistory", async ({ user, toUser }) => {
    const msgs = await Message.find({
      $or: [
        { from: user, to: toUser },
        { from: toUser, to: user }
      ]
    }).sort({ createdAt: 1 });
    socket.emit("history", msgs);
  });

  // Message vu
  socket.on("seen", ({ from, to }) => {
    Message.updateMany({ from, to, seen: false }, { seen: true }, err => {
      if(err) console.error(err);
    });
    if(users[to]) io.to(users[to]).emit("seen", { from, to });
  });

  // Supprimer message
  socket.on("deleteMessage", id => {
    Message.deleteOne({ id }, err => { if(err) console.error(err); });
    io.emit("deleteMessage", id);
  });

  // Utilisateurs connectés
  socket.on("getUsers", async () => {
    const allUsers = await User.find();
    socket.emit("users", allUsers.map(u => ({ username: u.username, online: !!users[u.username] })));
  });

  socket.on("disconnect", () => {
    if(username) delete users[username];
  });
});

/* ======================
   PORT
====================== */
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("Serveur lancé sur le port " + PORT);
});
