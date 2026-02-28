require("dotenv").config();
const express = require("express");
const http = require("http");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static("public"));
app.use("/uploads", express.static("uploads"));

if (!fs.existsSync("uploads")) fs.mkdirSync("uploads");

/* ===================== MONGODB ===================== */

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log("MongoDB connecté"))
  .catch(err => console.error(err));

const User = mongoose.model("User", new mongoose.Schema({
  username: { type: String, unique: true },
  password: String,
  online: { type: Boolean, default: false }
}));

const Message = mongoose.model("Message", new mongoose.Schema({
  from: String,
  to: String,
  text: String,
  image: String,
  seen: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
}));

/* ===================== AUTH ===================== */

app.post("/api/register", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.json({ error: "Champs manquants" });

  const hash = await bcrypt.hash(password, 10);

  try {
    await User.create({ username, password: hash });
    res.json({ success: true });
  } catch {
    res.json({ error: "Utilisateur existe déjà" });
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

/* ===================== UPLOAD IMAGE ===================== */

const storage = multer.diskStorage({
  destination: "uploads",
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ storage });

app.post("/api/upload", upload.single("image"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Aucune image" });
  res.json({ image: "/uploads/" + req.file.filename });
});

/* ===================== SOCKET.IO ===================== */

io.on("connection", async (socket) => {

  socket.on("join", async (username) => {
    socket.username = username;
    await User.updateOne({ username }, { online: true });

    const users = await User.find({}, "username online");
    io.emit("users", users);

    const history = await Message.find({
      $or: [
        { from: username },
        { to: username }
      ]
    }).sort({ createdAt: 1 });

    socket.emit("history", history);
  });

  socket.on("privateMessage", async ({ from, to, text, image }) => {
    if (!text && !image) return;

    const msg = await Message.create({ from, to, text: text || "", image: image || null });

    // Envoyer aux deux utilisateurs
    io.sockets.sockets.forEach(s => {
      if (s.username === from || s.username === to) {
        s.emit("privateMessage", msg);
      }
    });
  });

  socket.on("typing", to => {
    io.sockets.sockets.forEach(s => {
      if (s.username === to) s.emit("typing", socket.username);
    });
  });

  socket.on("stopTyping", to => {
    io.sockets.sockets.forEach(s => {
      if (s.username === to) s.emit("stopTyping", socket.username);
    });
  });

  socket.on("seen", to => {
    Message.updateMany(
      { from: to, to: socket.username, seen: false },
      { seen: true }
    ).then(() => {
      io.sockets.sockets.forEach(s => {
        if (s.username === to || s.username === socket.username)
          s.emit("seen", { from: to, to: socket.username });
      });
    });
  });

  socket.on("deleteMessage", async id => {
    const msg = await Message.findById(id);
    if (!msg) return;
    if (msg.from !== socket.username) return;
    await Message.findByIdAndDelete(id);

    io.sockets.sockets.forEach(s => {
      if (s.username === msg.from || s.username === msg.to)
        s.emit("deleteMessage", id);
    });
  });

  socket.on("disconnect", async () => {
    if (!socket.username) return;
    await User.updateOne({ username: socket.username }, { online: false });
  });
});

server.listen(process.env.PORT || 3000, () => console.log("Serveur lancé"));
