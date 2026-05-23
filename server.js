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
    edited: { type: Boolean, default: false },
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

// ===== USERS REST API =====

app.get("/api/users", async (req, res) => {
    const users = await User.find({}, { password: 0 });
    res.json(users);
});

// ===== MESSAGES REST API =====

app.get("/api/messages", async (req, res) => {
    const { from, to } = req.query;
    if (!from || !to) return res.json({ error: "Paramètres manquants" });

    const messages = await Message.find({
        $or: [{ from, to }, { from: to, to: from }]
    }).sort({ createdAt: 1 });

    res.json(messages);
});

// ===== SOCKET.IO =====

const onlineUsers = {};

io.on("connection", (socket) => {

    // ----- JOIN -----
    socket.on("join", async (username) => {
        if (!username) return;

        socket.username = username;
        onlineUsers[username] = socket.id;

        await User.updateOne({ username }, { online: true });

        broadcastUsers();
    });

    // ----- GET USERS -----
    socket.on("getUsers", async () => {
        const users = await User.find({}, { password: 0 });
        socket.emit("users", users);
    });

    // ----- PRIVATE MESSAGE -----
    // chat.js émet "privateMessage"
    socket.on("privateMessage", async (data) => {
        const { from, to, text, file, fileType, id: tempId } = data;
        if (!from || !to) return;

        // Sauvegarder en base MongoDB
        const saved = await Message.create({ from, to, text, file, fileType });

        const msgOut = {
            id:       saved._id.toString(),
            from,
            to,
            text,
            file,
            fileType,
            seen:     false,
            time:     new Date().toLocaleTimeString("fr-FR").slice(0, 5)
        };

        // Confirmer à l'expéditeur (remplace l'affichage local optimiste)
        socket.emit("messageConfirmed", { tempId, msg: msgOut });

        // Envoyer au destinataire s'il est connecté
        const toSocketId = onlineUsers[to];
        if (toSocketId) {
            io.to(toSocketId).emit("privateMessage", msgOut);
            io.to(toSocketId).emit("newMessageNotification", { from, to });
        }
    });

    // ----- HISTORIQUE -----
    // chat.js émet "getHistory" au chargement
    socket.on("getHistory", async ({ from, to }) => {
        if (!from || !to) return;

        const messages = await Message.find({
            $or: [{ from, to }, { from: to, to: from }]
        }).sort({ createdAt: 1 });

        const formatted = messages.map(m => ({
            id:       m._id.toString(),
            from:     m.from,
            to:       m.to,
            text:     m.text,
            file:     m.file,
            fileType: m.fileType,
            seen:     m.seen,
            time:     new Date(m.createdAt).toLocaleTimeString("fr-FR").slice(0, 5)
        }));

        socket.emit("history", formatted);
    });

    // ----- SEEN -----
    socket.on("seen", async ({ from, to }) => {
        await Message.updateMany({ from, to, seen: false }, { seen: true });

        const fromSocketId = onlineUsers[from];
        if (fromSocketId) {
            io.to(fromSocketId).emit("seen");
            io.to(fromSocketId).emit("messagesRead", { from, to });
        }

        socket.emit("messagesRead", { from });
    });

    // ----- TYPING -----
    socket.on("typing", ({ from, to }) => {
        const toSocketId = onlineUsers[to];
        if (toSocketId) io.to(toSocketId).emit("typing", { from });
    });

    socket.on("stopTyping", ({ from, to }) => {
        const toSocketId = onlineUsers[to];
        if (toSocketId) io.to(toSocketId).emit("stopTyping", { from });
    });

    // ----- EDIT MESSAGE -----
    socket.on("editMessage", async ({ id, newText }) => {
        try {
            const msg = await Message.findById(id);
            if (!msg) return;
            if (msg.from !== socket.username) return;

            await Message.updateOne({ _id: id }, { text: newText, edited: true });

            const payload = { id, newText };
            socket.emit("messageEdited", payload);

            const toSocketId = onlineUsers[msg.to];
            if (toSocketId) io.to(toSocketId).emit("messageEdited", payload);
        } catch(e) {
            console.error("editMessage error:", e);
        }
    });

    // ----- DELETE MESSAGE -----
    socket.on("deleteMessage", async (id) => {
        try {
            const msg = await Message.findById(id);
            if (!msg) return;
            if (msg.from !== socket.username) return; // Seul l'auteur peut supprimer

            await Message.deleteOne({ _id: id });

            socket.emit("deleteMessage", id);

            const toSocketId = onlineUsers[msg.to];
            if (toSocketId) io.to(toSocketId).emit("deleteMessage", id);
        } catch (e) {
            console.error("deleteMessage error:", e);
        }
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

async function broadcastUsers() {
    const users = await User.find({}, { password: 0 });
    io.emit("users", users);
}

// ===== START =====

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Serveur lancé sur ${PORT}`);
});
