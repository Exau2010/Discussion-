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
app.use(express.static(".")); // fichiers à la racine

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log("MongoDB connecté"))
  .catch(err => console.error(err));

// ===== MODELS =====

// Messages expirent automatiquement après 7 jours (TTL)
const MessageSchema = new mongoose.Schema({
  from: String,
  to: String,
  text: String,
  createdAt: { type: Date, default: Date.now, expires: 7*24*60*60 } // expire après 7 jours
});
const Message = mongoose.model("Message", MessageSchema);

const User = mongoose.model("User", new mongoose.Schema({
  username: { type: String, unique: true },
  password: String,
  online: { type: Boolean, default: false }
}));

const FriendRequest = mongoose.model("FriendRequest", new mongoose.Schema({
  from: String,
  to: String,
  status: { type: String, default: "pending" },
  createdAt: { type: Date, default: Date.now }
}));

// ===== AUTH =====
app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username });
  if (!user) return res.json({ error: "Compte inexistant" });
  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.json({ error: "Mot de passe incorrect" });
  res.json({ success: true });
});

// ===== RECHERCHE UTILISATEUR =====
app.get("/api/search", async (req, res) => {
  const { q } = req.query;
  const users = await User.find({ username: { $regex: q, $options: "i" } }, "username online");
  res.json(users);
});

// ===== PROFIL PUBLIC =====
app.get("/api/user/:username", async (req, res) => {
  const u = await User.findOne({ username: req.params.username }, "username online");
  if (!u) return res.status(404).json({ error: "Utilisateur introuvable" });
  res.json(u);
});

// ===== SOCKET.IO =====
io.on("connection", (socket) => {
  socket.on("join", async (username) => {
    socket.username = username;
    await User.updateOne({ username }, { online: true });
    const users = await User.find({}, "username online");
    io.emit("users", users);

    const pending = await FriendRequest.find({ to: username, status: "pending" });
    socket.emit("friendRequests", pending);

    // Envoyer les messages récents (7 derniers jours seulement)
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

  socket.on("friendRequest", async ({ to }) => {
    if (!socket.username) return;
    const exists = await FriendRequest.findOne({ from: socket.username, to, status: "pending" });
    if (exists) return;
    const req = await FriendRequest.create({ from: socket.username, to });
    const recipientSocket = Array.from(io.sockets.sockets.values()).find(s => s.username === to);
    if (recipientSocket) recipientSocket.emit("friendRequests", [req]);
  });

  socket.on("friendResponse", async ({ id, accept }) => {
    const req = await FriendRequest.findById(id);
    if (!req) return;
    req.status = accept ? "accepted" : "rejected";
    await req.save();
    const senderSocket = Array.from(io.sockets.sockets.values()).find(s => s.username === req.from);
    if (senderSocket) senderSocket.emit("friendResponse", req);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("Serveur lancé sur le port " + PORT));
