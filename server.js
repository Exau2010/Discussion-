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
  email: { type: String, unique: true },
  online: { type: Boolean, default: false }
}));

const Message = mongoose.model("Message", new mongoose.Schema({
  from: String,
  to: String,
  text: String,
  file: String,
  fileType: String,
  seen: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now, expires: 7*24*60*60 }
}));

// ===== ADMIN CREDENTIALS =====
const ADMIN_USERNAME = "JEX-EXAU-ARI";
const ADMIN_PASSWORD = "20/10/11";

// ===== API =====
app.post("/api/register", async (req, res) => {
  let { username, email, password } = req.body;
  if (!username || !email || !password) return res.json({ error: "Champs manquants" });

  username = username.trim();
  email = email.toLowerCase().trim();

  if (!email.includes("@")) {
    return res.json({ error: "Email invalide" });
  }

  try {
    const hash = await bcrypt.hash(password, 10);
    await User.create({ username, email, password: hash });
    res.json({ success: true });
  } catch {
    res.json({ error: "Utilisateur déjà existant" });
  }
});

app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;

  // Check admin credentials first (admin not stored in DB)
  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    return res.json({ success: true, isAdmin: true });
  }

  const user = await User.findOne({
    $or: [
      { username: username },
      { email: username }
    ]
  });

  if (!user) return res.json({ error: "Compte inexistant" });

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.json({ error: "Mot de passe incorrect" });

  res.json({ success: true, isAdmin: false });
});

// ===== Admin: delete a user account =====
app.post("/api/admin/delete-user", async (req, res) => {
  const { adminUsername, targetUsername } = req.body;
  if (adminUsername !== ADMIN_USERNAME) return res.json({ error: "Non autorisé" });

  try {
    await User.deleteOne({ username: targetUsername });
    await Message.deleteMany({ $or: [{ from: targetUsername }, { to: targetUsername }] });
    // Notify all clients
    io.emit("userDeleted", targetUsername);
    res.json({ success: true });
  } catch {
    res.json({ error: "Erreur lors de la suppression" });
  }
});

// ===== User: delete own account =====
app.post("/api/delete-account", async (req, res) => {
  const { username } = req.body;
  try {
    await User.deleteOne({ username });
    await Message.deleteMany({ $or: [{ from: username }, { to: username }] });
    io.emit("userDeleted", username);
    res.json({ success: true });
  } catch {
    res.json({ error: "Erreur lors de la suppression" });
  }
});

// ===== Socket.IO =====
io.on("connection", socket => {

  socket.on("join", async username => {
    socket.username = username;

    await User.updateOne({ username }, { online: true });

    // Only send non-admin users
    const users = await User.find({ username: { $ne: "JEX-EXAU-ARI" } }, "username online");
    io.emit("users", users);

    const messages = await Message.find({
      $or: [{ from: username }, { to: username }]
    }).sort({ createdAt: 1 }).lean();

    socket.emit("history", messages.map(m => ({
      id: m._id,
      from: m.from,
      to: m.to,
      text: m.text,
      file: m.file,
      fileType: m.fileType,
      seen: m.seen
    })));
  });

  socket.on("getUsers", async () => {
    const users = await User.find({ username: { $ne: "JEX-EXAU-ARI" } }, "username online");
    socket.emit("users", users);
  });

  socket.on("privateMessage", async ({ from, to, text, file, fileType }) => {
    const msg = await Message.create({ from, to, text, file, fileType });

    io.sockets.sockets.forEach(s => {
      if (s.username === from || s.username === to) {
        s.emit("privateMessage", {
          id: msg._id,
          from,
          to,
          text,
          file,
          fileType,
          seen: false
        });
      }
    });

    // Send unread notification to recipient if they are connected but not in chat with sender
    io.sockets.sockets.forEach(s => {
      if (s.username === to) {
        s.emit("newMessageNotification", { from, to, text });
      }
    });
  });

  // ===== Typing =====
  socket.on("typing", data => {
    io.sockets.sockets.forEach(s => {
      if (s.username === data.to) s.emit("typing", data);
    });
  });

  socket.on("stopTyping", data => {
    io.sockets.sockets.forEach(s => {
      if (s.username === data.to) s.emit("stopTyping", data);
    });
  });

  // ===== Seen =====
  socket.on("seen", async ({ from, to }) => {
    await Message.updateMany({ from, to, seen: false }, { seen: true });

    io.sockets.sockets.forEach(s => {
      if (s.username === from) {
        s.emit("seen", { from, to });
      }
    });

    // Notify recipient that messages were read (clear notification dot)
    io.sockets.sockets.forEach(s => {
      if (s.username === to) {
        s.emit("messagesRead", { from, to });
      }
    });
  });

  // ===== Delete =====
  socket.on("deleteMessage", async id => {
    await Message.deleteOne({ _id: id });
    io.emit("deleteMessage", id);
  });

  // ===== Status =====
  socket.on("getUserStatus", async username => {
    const u = await User.findOne({ username }, "username online");
    if (u) socket.emit("userStatus", u);
  });

  socket.on("disconnect", async () => {
    if (!socket.username) return;

    await User.updateOne({ username: socket.username }, { online: false });

    const users = await User.find({ username: { $ne: "JEX-EXAU-ARI" } }, "username online");
    io.emit("users", users);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Serveur lancé sur le port ${PORT}`));
