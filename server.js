require("dotenv").config(); // pour local et Render

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());

// Sert les fichiers directement depuis la racine
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "index.html")));
app.get("/chat.html", (req, res) => res.sendFile(path.join(__dirname, "chat.html")));
app.get("/style.css", (req, res) => res.sendFile(path.join(__dirname, "style.css")));
app.get("/script.js", (req, res) => res.sendFile(path.join(__dirname, "script.js")));

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
  password: String
}));

const Message = mongoose.model("Message", new mongoose.Schema({
  user: String,
  text: String,
  createdAt: { type: Date, default: Date.now }
}));

/* ======================
   AUTH API
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
  if (!user) return res.status(400).json({ error: "Compte inexistant" });

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.status(400).json({ error: "Mot de passe incorrect" });

  res.json({ success: true, username });
});

/* ======================
   Socket.IO
====================== */
io.on("connection", async (socket) => {
  // Envoyer l'historique des 50 derniers messages
  const messages = await Message.find().sort({ createdAt: 1 }).limit(50);
  socket.emit("history", messages);

  // Reçoit les messages du client
  socket.on("message", async (data) => {
    const { user, text } = data;
    if (!user || !text) return;

    const msg = await Message.create({ user, text });
    io.emit("message", { user: msg.user, text: msg.text });
  });

  socket.on("disconnect", () => {
    // Optionnel : tu peux émettre un message système si tu veux
  });
});

/* ======================
   PORT
====================== */
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log("Serveur lancé sur le port " + PORT));
