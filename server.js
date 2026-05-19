// =========================
// server.js COMPLET (CORRIGÉ)
// =========================

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
    .catch(err => console.log(err));

// ===== Models =====

const User = mongoose.model("User", new mongoose.Schema({
    username: { type: String, unique: true },
    password: String,
    online: { type: Boolean, default: false }
}));

const Message = mongoose.model("Message", new mongoose.Schema({
    from: String,
    to: String,
    text: String,
    file: String,
    fileType: String,
    seen: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now, expires: 7 * 24 * 60 * 60 }
}));

// ===== ADMIN =====

const ADMIN_USERNAME = "JEX-EXAU-ARI";
const ADMIN_PASSWORD = "20/10/11";

// ===== REGISTER =====

app.post("/api/register", async (req, res) => {
    let { username, password } = req.body;
    if (!username || !password) return res.json({ error: "Champs manquants" });
    try {
        const hash = await bcrypt.hash(password, 10);
        await User.create({ username, password: hash });
        res.json({ success: true });
    } catch {
        res.json({ error: "Utilisateur déjà existant" });
    }
});

// ===== LOGIN =====

app.post("/api/login", async (req, res) => {
    const { username, password } = req.body;

    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
        return res.json({ success: true, isAdmin: true });
    }

    const user = await User.findOne({ username });
    if (!user) return res.json({ error: "Compte inexistant" });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.json({ error: "Mot de passe incorrect" });

    res.json({ success: true, isAdmin: false });
});

// ===== DELETE USER (ADMIN) =====

app.post("/api/admin/delete-user", async (req, res) => {
    const { adminUsername, targetUsername } = req.body;
    if (adminUsername !== ADMIN_USERNAME) return res.json({ error: "Non autorisé" });

    try {
        await User.deleteOne({ username: targetUsername });
        await Message.deleteMany({ $or: [{ from: targetUsername }, { to: targetUsername }] });
        io.emit("userDeleted", targetUsername);
        res.json({ success: true });
    } catch {
        res.json({ error: "Erreur suppression" });
    }
});

// ===== DELETE OWN ACCOUNT =====

app.post("/api/delete-account", async (req, res) => {
    const { username } = req.body;
    try {
        await User.deleteOne({ username });
        await Message.deleteMany({ $or: [{ from: username }, { to: username }] });
        io.emit("userDeleted", username);
        res.json({ success: true });
    } catch {
        res.json({ error: "Erreur suppression" });
    }
});

// ===== MESSAGES REST API =====

// Récupérer l'historique des messages entre deux utilisateurs
app.get("/api/messages", async (req, res) => {
    const { from, to } = req.query;
    if (!from || !to) return res.json({ error: "Paramètres manquants" });

    const messages = await Message.find({
        $or: [
            { from, to },
            { from: to, to: from }
        ]
    }).sort({ createdAt: 1 });

    res.json(messages);
});

// ===== SOCKET.IO =====

// Map username -> socket.id
const onlineUsers = {};

io.on("connection", (socket) => {

    // ----- JOIN -----
    // Le client émet "join" avec son username dès qu'il arrive sur home/chat
    socket.on("join", async (username) => {
        if (!username) return;

        socket.username = username;
        onlineUsers[username] = socket.id;

        // Marquer online en base
        await User.updateOne({ username }, { online: true });

        // Diffuser la liste à jour
        broadcastUsers();
    });

    // ----- GET USERS -----
    // Le client demande la liste des utilisateurs
    socket.on("getUsers", async () => {
        const users = await User.find({}, { password: 0 });
        socket.emit("users", users);
    });

    // ----- SEND MESSAGE -----
    socket.on("sendMessage", async ({ from, to, text, file, fileType }) => {
        if (!from || !to) return;

        const msg = await Message.create({ from, to, text, file, fileType });

        // Envoyer le message au destinataire s'il est connecté
        const toSocketId = onlineUsers[to];
        if (toSocketId) {
            io.to(toSocketId).emit("receiveMessage", msg);
        }

        // Envoyer aussi à l'expéditeur (confirmation)
        socket.emit("receiveMessage", msg);

        // Notification de nouveau message
        if (toSocketId) {
            io.to(toSocketId).emit("newMessageNotification", { from, to });
        }
    });

    // ----- MARK AS READ -----
    socket.on("markAsRead", async ({ from, to }) => {
        await Message.updateMany(
            { from, to, seen: false },
            { seen: true }
        );

        // Informer l'expéditeur que ses messages ont été lus
        const fromSocketId = onlineUsers[from];
        if (fromSocketId) {
            io.to(fromSocketId).emit("messagesRead", { from, to });
        }

        // Informer aussi le lecteur pour effacer ses badges
        socket.emit("messagesRead", { from });
    });

    // ----- DISCONNECT -----
    socket.on("disconnect", async () => {
        if (socket.username) {
            delete onlineUsers[socket.username];
            await User.updateOne({ username: socket.username }, { online: false });
            broadcastUsers();
        }
    });
});

// Envoie la liste de tous les utilisateurs à tous les clients connectés
async function broadcastUsers() {
    const users = await User.find({}, { password: 0 });
    io.emit("users", users);
}

// ===== START =====

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Serveur lancé sur ${PORT}`);
});
