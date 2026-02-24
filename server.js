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
app.use(express.static(".")); // tous les fichiers sont dans la racine

// ===== MongoDB =====
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log("MongoDB connecté"))
  .catch(err => console.error("Erreur MongoDB :", err));

// ===== Schemas =====
const User = mongoose.model("User", new mongoose.Schema({
  username: { type: String, unique: true },
  password: String,
  online: { type: Boolean, default: false }
}));

const Message = mongoose.model("Message", new mongoose.Schema({
  from: String,
  to: String,
  text: String,
  createdAt: { type: Date, default: Date.now, expires: 7*24*60*60 } // expire 7 jours
}));

// ===== API =====

// Inscription
app.post("/api/register", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.json({ error: "Champs manquants" });

  try {
    const hash = await bcrypt.hash(password, 10);
    await User.create({ username, password: hash });
    res.json({ success: true });
  } catch {
    res.json({ error: "Utilisateur déjà existant" });
  }
});

// Connexion
app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username });
  if (!user) return res.json({ error: "Compte inexistant" });

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.json({ error: "Mot de passe incorrect" });

  res.json({ success: true });
});

// ===== Socket.IO =====
io.on("connection", socket => {

  // Utilisateur rejoint
  socket.on("join", async username => {
    socket.username = username;

    // Marquer l'utilisateur en ligne
    await User.updateOne({ username }, { online: true });

    // Envoyer liste des utilisateurs à tous
    const users = await User.find({}, "username online");
    io.emit("users", users);

    // Historique des messages avec l'utilisateur
    const messages = await Message.find({
      $or: [{ from: username }, { to: username }]
    }).sort({ createdAt: 1 }).lean();

    socket.emit("history", messages.map(m => ({
      from: m.from,
      to: m.to,
      text: m.text
    })));
  });

  // Liste des utilisateurs (refresh)
  socket.on("getUsers", async () => {
    const users = await User.find({}, "username online");
    socket.emit("users", users);
  });

  // Message privé
  socket.on("privateMessage", async ({ from, to, text }) => {
    const msg = await Message.create({ from, to, text });

    // Envoyer le message aux deux utilisateurs (expéditeur + destinataire)
    io.sockets.sockets.forEach(s => {
      if (s.username === from || s.username === to) {
        s.emit("privateMessage", { from, to, text });
      }
    });
  });

  // Statut d’un utilisateur
  socket.on("getUserStatus", async username => {
    const u = await User.findOne({ username }, "username online");
    if (u) socket.emit("userStatus", { username: u.username, online: u.online });
  });

  // Utilisateur déconnecte
  socket.on("disconnect", async () => {
    if (!socket.username) return;

    await User.updateOne({ username: socket.username }, { online: false });

    const users = await User.find({}, "username online");
    io.emit("users", users);
  });
});

// ===== PORT =====
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Serveur lancé sur le port ${PORT}`));
