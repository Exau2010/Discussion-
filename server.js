require("dotenv").config();
const express = require("express");
const http = require("http");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
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

/* ===================== JWT Middleware ===================== */

function authMiddleware(req, res, next) {
  const token = req.headers.authorization;
  if (!token) return res.status(401).json({ error: "Token manquant" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded.username;
    next();
  } catch {
    return res.status(401).json({ error: "Token invalide" });
  }
}

/* ===================== AUTH ROUTES ===================== */

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

  const token = jwt.sign(
    { username },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );

  res.json({ success: true, token });
});

/* ===================== UPLOAD IMAGE ===================== */

const storage = multer.diskStorage({
  destination: "uploads",
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ storage });

app.post("/api/upload", authMiddleware, upload.single("image"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Aucune image" });
  res.json({ image: "/uploads/" + req.file.filename });
});

/* ===================== SOCKET.IO ===================== */

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error("Non autorisé"));

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.username = decoded.username;
    next();
  } catch {
    next(new Error("Token invalide"));
  }
});

io.on("connection", async (socket) => {

  await User.updateOne(
    { username: socket.username },
    { online: true }
  );

  socket.on("join", async (toUser) => {

    const room = [socket.username, toUser].sort().join("-");
    socket.join(room);

    const history = await Message.find({
      $or: [
        { from: socket.username, to: toUser },
        { from: toUser, to: socket.username }
      ]
    }).sort({ createdAt: 1 });

    socket.emit("history", history);
  });

  socket.on("privateMessage", async ({ to, text, image }) => {

    if (!text && !image) return;

    const msg = await Message.create({
      from: socket.username,
      to,
      text: text || "",
      image: image || null
    });

    const room = [socket.username, to].sort().join("-");
    io.to(room).emit("privateMessage", msg);
  });

  socket.on("typing", (to) => {
    const room = [socket.username, to].sort().join("-");
    socket.to(room).emit("typing", socket.username);
  });

  socket.on("stopTyping", (to) => {
    const room = [socket.username, to].sort().join("-");
    socket.to(room).emit("stopTyping", socket.username);
  });

  socket.on("seen", async (to) => {

    await Message.updateMany(
      { from: to, to: socket.username, seen: false },
      { seen: true }
    );

    const room = [socket.username, to].sort().join("-");
    io.to(room).emit("seen", {
      from: to,
      to: socket.username
    });
  });

  socket.on("deleteMessage", async (id) => {

    const msg = await Message.findById(id);
    if (!msg) return;

    if (msg.from !== socket.username) return;

    await Message.findByIdAndDelete(id);

    const room = [msg.from, msg.to].sort().join("-");
    io.to(room).emit("deleteMessage", id);
  });

  socket.on("disconnect", async () => {
    await User.updateOne(
      { username: socket.username },
      { online: false }
    );
  });
});

server.listen(process.env.PORT || 3000, () => {
  console.log("Serveur lancé");
});
