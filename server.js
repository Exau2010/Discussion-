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
  username: { type: String, unique: true },
  password: String,
  online: { type: Boolean, default: false }
}));

const Message = mongoose.model("Message", new mongoose.Schema({
  from: String,
  to: String,
  text: String,
  seen: { type: Boolean, default: false },
  time: String,
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 7 * 24 * 60 * 60 // 7 jours
  }
}));

// ===== API =====
app.post("/api/register", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.json({ error: "Champs manquants" });

  try {
    const hash = await bcrypt.hash(password, 10);
    await User.create({ username, password: hash });
    res.json({ success: true });
  } catch {
    res.json({ error: "Utilisateur déjà existant" });
  }
});

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

  // =========================
  // JOIN
  // =========================
  socket.on("join", async username => {
    socket.username = username;

    await User.updateOne({ username }, { online: true });

    const users = await User.find({}, "username online");
    io.emit("users", users);

    // Historique
    const messages = await Message.find({
      $or: [{ from: username }, { to: username }]
    }).sort({ createdAt: 1 }).lean();

    socket.emit("history", messages);
  });

  // =========================
  // MESSAGE PRIVÉ
  // =========================
  socket.on("privateMessage", async msg => {

    // Sécurité : pas d’usurpation
    if (msg.from !== socket.username) return;

    const saved = await Message.create(msg);

    io.sockets.sockets.forEach(s => {
      if (s.username === saved.from || s.username === saved.to) {
        s.emit("privateMessage", saved);
      }
    });
  });

  // =========================
  // TYPING
  // =========================
  socket.on("typing", data => {
    io.sockets.sockets.forEach(s => {
      if (s.username === data.to) {
        s.emit("typing", data);
      }
    });
  });

  socket.on("stopTyping", data => {
    io.sockets.sockets.forEach(s => {
      if (s.username === data.to) {
        s.emit("stopTyping", data);
      }
    });
  });

  // =========================
  // MESSAGE VU (PAR MESSAGE)
  // =========================
  socket.on("seen", async data => {

    const msg = await Message.findById(data.messageId);
    if (!msg) return;

    // seul le destinataire peut marquer vu
    if (msg.to !== socket.username) return;

    msg.seen = true;
    await msg.save();

    io.sockets.sockets.forEach(s => {
      if (s.username === msg.from) {
        s.emit("seen", {
          messageId: msg._id,
          time: new Date().toLocaleTimeString().slice(0, 5)
        });
      }
    });
  });

  // =========================
  // SUPPRESSION MESSAGE
  // =========================
  socket.on("deleteMessage", async messageId => {

    const msg = await Message.findById(messageId);
    if (!msg) return;

    // seul l’expéditeur peut supprimer
    if (msg.from !== socket.username) return;

    await Message.findByIdAndDelete(messageId);

    io.sockets.sockets.forEach(s => {
      if (s.username === msg.from || s.username === msg.to) {
        s.emit("deleteMessage", messageId);
      }
    });
  });

  // =========================
  // DECONNEXION
  // =========================
  socket.on("disconnect", async () => {
    if (!socket.username) return;

    await User.updateOne(
      { username: socket.username },
      { online: false }
    );

    const users = await User.find({}, "username online");
    io.emit("users", users);
  });
});

// ===== PORT =====
const PORT = process.env.PORT || 3000;
server.listen(PORT, () =>
  console.log(`Serveur lancé sur le port ${PORT}`)
);
