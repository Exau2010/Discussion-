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
app.use(express.static(".")); // tous les fichiers à la racine

// ===== MongoDB =====
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log("MongoDB connecté"))
  .catch(err => console.error(err));

// ===== Modèles =====
const User = mongoose.model("User", new mongoose.Schema({
  username: { type: String, unique: true },
  password: String,
  online: { type: Boolean, default: false }
}));

const Message = mongoose.model("Message", new mongoose.Schema({
  from: String,
  to: String,
  text: String,
  createdAt: { type: Date, default: Date.now, expires: 7*24*60*60 } // messages expirent après 7 jours
}));

// ===== Inscription =====
app.post("/api/register", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.json({ error: "Champs manquants" });
  try {
    const hash = await bcrypt.hash(password, 10);
    await User.create({ username, password: hash });
    res.json({ success: true });
  } catch (err) {
    res.json({ error: "Utilisateur déjà existant" });
  }
});

// ===== Connexion =====
app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username });
  if (!user) return res.json({ error: "Compte inexistant" });
  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.json({ error: "Mot de passe incorrect" });
  res.json({ success: true });
});

// ===== Socket.IO =====
io.on("connection", (socket) => {

  // Quand un utilisateur rejoint
  socket.on("join", async (username) => {
    socket.username = username;
    await User.updateOne({ username }, { online: true });

    // envoyer la liste des utilisateurs connectés
    const users = await User.find({}, "username online");
    io.emit("users", users);

    // envoyer l'historique des messages sous forme simple {from, text}
    const messages = await Message.find().sort({ createdAt: 1 }).lean();
    const simpleMsgs = messages.map(m => ({ from: m.from, text: m.text }));
    socket.emit("history", simpleMsgs);
  });

  // Quand un utilisateur envoie un message
  socket.on("message", async ({ to, text }) => {
    if (!socket.username) return;

    // sauvegarde dans la DB
    await Message.create({ from: socket.username, to, text });

    // envoi à tous les clients un objet simple
    io.emit("message", { from: socket.username, text });
  });

  // Quand un utilisateur se déconnecte
  socket.on("disconnect", async () => {
    if (!socket.username) return;
    await User.updateOne({ username: socket.username }, { online: false });
    const users = await User.find({}, "username online");
    io.emit("users", users);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("Serveur lancé sur le port " + PORT));
