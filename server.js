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

// ===== MONGODB =====
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log("MongoDB connecté"))
  .catch(err => console.error(err));

// ===== MODELS =====
const User = mongoose.model("User", new mongoose.Schema({
  username: { type: String, unique: true },
  password: String,
  online: { type: Boolean, default: false }
}));

const Message = mongoose.model("Message", new mongoose.Schema({
  from: String,
  to: String,
  text: String,
  createdAt: { type: Date, default: Date.now, expires: 7*24*60*60 } // expire après 7 jours
}));

// ===== INSCRIPTION =====
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

// ===== CONNEXION =====
app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username });
  if (!user) return res.json({ error: "Compte inexistant" });
  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.json({ error: "Mot de passe incorrect" });
  res.json({ success: true });
});

// ===== SOCKET.IO =====
io.on("connection", (socket) => {
  socket.on("join", async (username) => {
    socket.username = username;
    await User.updateOne({ username }, { online: true });
    const users = await User.find({}, "username online");
    io.emit("users", users);

    const messages = await Message.find({
      $or: [{ from: username }, { to: username }]
    }).sort({ createdAt: 1 });
    socket.emit("history", messages);
  });

  socket.on("disconnect", async () => {
    if (!socket.username) return;
    await User.updateOne({ username: socket.username }, { online: false });
    const users = await User.find({}, "username online");
    io.emit("users", users);
  });

  socket.on("message", async ({ to, text }) => {
    if (!socket.username) return;
    const msg = await Message.create({ from: socket.username, to, text });
    const recipientSocket = Array.from(io.sockets.sockets.values()).find(s => s.username === to);
    if (recipientSocket) recipientSocket.emit("newMessage", msg);
    socket.emit("messageSent", msg);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("Serveur lancé sur le port " + PORT));
