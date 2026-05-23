// =========================
// server.js JEXREY — News partagées + Likes + Commentaires + Photos de profil
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

app.use(express.json({ limit: "10mb" })); // Pour les photos de profil base64
app.use(express.static("."));

// ===== MongoDB =====

mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log("MongoDB connecté"))
    .catch(err => console.log(err));

// ===== Models =====

const User = mongoose.model("User", new mongoose.Schema({
    username: { type: String, unique: true },
    password: String,
    online: { type: Boolean, default: false },
    avatar: { type: String, default: "" } // base64 photo de profil
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

const NewsModel = mongoose.model("News", new mongoose.Schema({
    id: { type: String, unique: true },
    author: String,
    text: String,
    bg: String,
    color: String,
    time: String,
    likes: { type: [String], default: [] },       // liste de usernames
    comments: {
        type: [{
            author: String,
            text: String,
            time: String,
            avatar: String
        }],
        default: []
    },
    views: { type: [String], default: [] },
    createdAt: { type: Date, default: Date.now }
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
        return res.json({ success: true, isAdmin: true, avatar: "" });
    }

    const user = await User.findOne({ username });
    if (!user) return res.json({ error: "Compte inexistant" });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.json({ error: "Mot de passe incorrect" });

    res.json({ success: true, isAdmin: false, avatar: user.avatar || "" });
});

// ===== PHOTO DE PROFIL =====

app.post("/api/avatar", async (req, res) => {
    const { username, avatar } = req.body;
    if (!username || !avatar) return res.json({ error: "Données manquantes" });
    try {
        await User.updateOne({ username }, { avatar });
        // Notifier tous les clients du changement d'avatar
        io.emit("avatarUpdated", { username, avatar });
        res.json({ success: true });
    } catch {
        res.json({ error: "Erreur mise à jour avatar" });
    }
});

app.get("/api/avatar/:username", async (req, res) => {
    const user = await User.findOne({ username: req.params.username });
    res.json({ avatar: user ? (user.avatar || "") : "" });
});

// ===== DELETE USER (ADMIN) =====

app.post("/api/admin/delete-user", async (req, res) => {
    const { adminUsername, targetUsername } = req.body;
    if (adminUsername !== ADMIN_USERNAME) return res.json({ error: "Non autorisé" });

    try {
        await User.deleteOne({ username: targetUsername });
        await Message.deleteMany({ $or: [{ from: targetUsername }, { to: targetUsername }] });
        await NewsModel.deleteMany({ author: targetUsername });
        io.emit("userDeleted", targetUsername);
        io.emit("newsUpdated");
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
        await NewsModel.deleteMany({ author: username });
        io.emit("userDeleted", username);
        io.emit("newsUpdated");
        res.json({ success: true });
    } catch {
        res.json({ error: "Erreur suppression" });
    }
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

// ===== NEWS API =====

// Récupérer toutes les news
app.get("/api/news", async (req, res) => {
    const news = await NewsModel.find({}).sort({ createdAt: -1 });
    res.json(news);
});

// Créer une news
app.post("/api/news", async (req, res) => {
    const { news } = req.body;
    if (!news) return res.json({ error: "Données manquantes" });
    try {
        const created = await NewsModel.create(news);
        io.emit("newNews", created);
        res.json({ success: true, news: created });
    } catch (e) {
        res.json({ error: "Erreur création news" });
    }
});

// Supprimer une news (auteur ou admin)
app.post("/api/news/delete", async (req, res) => {
    const { newsId, username, isAdmin } = req.body;
    try {
        const news = await NewsModel.findOne({ id: newsId });
        if (!news) return res.json({ error: "News introuvable" });
        if (news.author !== username && !isAdmin) return res.json({ error: "Non autorisé" });
        await NewsModel.deleteOne({ id: newsId });
        io.emit("newsDeleted", newsId);
        res.json({ success: true });
    } catch {
        res.json({ error: "Erreur suppression" });
    }
});

// Liker/Unliker une news
app.post("/api/news/like", async (req, res) => {
    const { newsId, username } = req.body;
    try {
        const news = await NewsModel.findOne({ id: newsId });
        if (!news) return res.json({ error: "News introuvable" });

        const idx = news.likes.indexOf(username);
        if (idx === -1) {
            news.likes.push(username);
        } else {
            news.likes.splice(idx, 1);
        }
        await news.save();
        io.emit("newsLiked", { newsId, likes: news.likes });
        res.json({ success: true, likes: news.likes });
    } catch {
        res.json({ error: "Erreur like" });
    }
});

// Commenter une news
app.post("/api/news/comment", async (req, res) => {
    const { newsId, comment } = req.body;
    try {
        const news = await NewsModel.findOne({ id: newsId });
        if (!news) return res.json({ error: "News introuvable" });
        news.comments.push(comment);
        await news.save();
        io.emit("newsCommented", { newsId, comment, comments: news.comments });
        res.json({ success: true, comments: news.comments });
    } catch {
        res.json({ error: "Erreur commentaire" });
    }
});

// Voir une news (ajoute viewer)
app.post("/api/news/view", async (req, res) => {
    const { newsId, username } = req.body;
    try {
        const news = await NewsModel.findOne({ id: newsId });
        if (!news) return res.json({ success: true });
        if (!news.views.includes(username)) {
            news.views.push(username);
            await news.save();
            io.emit("newsViewed", { newsId, views: news.views });
        }
        res.json({ success: true, views: news.views });
    } catch {
        res.json({ success: true });
    }
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
    socket.on("privateMessage", async (data) => {
        const { from, to, text, file, fileType, id: tempId } = data;
        if (!from || !to) return;

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

        socket.emit("messageConfirmed", { tempId, msg: msgOut });

        const toSocketId = onlineUsers[to];
        if (toSocketId) {
            io.to(toSocketId).emit("privateMessage", msgOut);
            io.to(toSocketId).emit("newMessageNotification", { from, to });
        }
    });

    // ----- HISTORIQUE -----
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

    // ----- DELETE MESSAGE -----
    socket.on("deleteMessage", async (id) => {
        try {
            const msg = await Message.findById(id);
            if (!msg) return;
            if (msg.from !== socket.username) return;

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
