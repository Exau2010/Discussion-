// =========================
// server.js JEXREY — Sans News, optimisé
// =========================

require("dotenv").config();

const express      = require("express");
const http         = require("http");
const mongoose     = require("mongoose");
const bcrypt       = require("bcrypt");
const { Server }   = require("socket.io");

const app    = express();
const server = http.createServer(app);

const io = new Server(server, {
    pingTimeout:  60000,
    pingInterval: 25000,
    transports:   ["websocket", "polling"],
    cors: { origin: "*" }
});

app.use(express.json({ limit: "10mb" }));
app.use(express.static(".", {
    setHeaders: (res, path) => {
        if (path.endsWith('.html')) {
            res.setHeader('Cache-Control', 'public, max-age=3600');
        } else if (path.match(/\.(js|css|jpg|png|ico|woff2?)$/)) {
            res.setHeader('Cache-Control', 'public, max-age=604800');
        }
    }
}));

// ===== MongoDB =====
const mongoOptions = {
    serverSelectionTimeoutMS: 10000,
    heartbeatFrequencyMS:     10000,
    socketTimeoutMS:          45000,
    family: 4
};

mongoose.connect(process.env.MONGODB_URI, mongoOptions)
    .then(() => console.log("✅ MongoDB connecté"))
    .catch(err => console.error("❌ MongoDB erreur:", err));

mongoose.connection.on("disconnected", () => console.warn("⚠️  MongoDB déconnecté..."));
mongoose.connection.on("reconnected",  () => console.log("✅ MongoDB reconnecté"));

// ===== Models =====

const User = mongoose.model("User", new mongoose.Schema({
    username:     { type: String, unique: true },
    password:     String,
    online:       { type: Boolean, default: false },
    avatar:       { type: String, default: "" },
    prenom:       { type: String, default: "" },
    age:          { type: String, default: "" },
    profession:   { type: String, default: "" },
    anniversaire: { type: String, default: "" },
    ville:        { type: String, default: "" },
    situation:    { type: String, default: "" },
    bio:          { type: String, default: "" }
}));

// Messages : expire après 7 jours automatiquement via TTL index MongoDB
const Message = mongoose.model("Message", new mongoose.Schema({
    from:      String,
    to:        String,
    text:      String,
    file:      String,
    fileType:  String,
    seen:      { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now, expires: 7 * 24 * 60 * 60 } // 7 jours
}));

// ===== Cache utilisateurs =====
let usersCache     = [];
let cacheTimestamp = 0;
const CACHE_TTL    = 10000;

async function getUsers() {
    const now = Date.now();
    if (now - cacheTimestamp < CACHE_TTL) return usersCache;
    usersCache     = await User.find({}, { password: 0 }).lean();
    cacheTimestamp = now;
    return usersCache;
}

function invalidateCache() { cacheTimestamp = 0; }

// ===== ADMIN =====
const ADMIN_USERNAME = "JEX-EXAU-ARI";
const ADMIN_PASSWORD = "20/10/11";

const asyncRoute = fn => (req, res, next) => fn(req, res, next).catch(next);

// ===== REGISTER =====
app.post("/api/register", asyncRoute(async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.json({ error: "Champs manquants" });
    try {
        const hash = await bcrypt.hash(password, 10);
        await User.create({ username, password: hash });
        invalidateCache();
        res.json({ success: true });
    } catch {
        res.json({ error: "Utilisateur déjà existant" });
    }
}));

// ===== LOGIN =====
app.post("/api/login", asyncRoute(async (req, res) => {
    const { username, password } = req.body;
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
        return res.json({ success: true, isAdmin: true, avatar: "" });
    }
    const user = await User.findOne({ username }).lean();
    if (!user) return res.json({ error: "Compte inexistant" });
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.json({ error: "Mot de passe incorrect" });
    res.json({ success: true, isAdmin: false, avatar: user.avatar || "" });
}));

// ===== AVATAR =====
app.post("/api/avatar", asyncRoute(async (req, res) => {
    const { username, avatar } = req.body;
    if (!username || !avatar) return res.json({ error: "Données manquantes" });
    await User.updateOne({ username }, { avatar });
    invalidateCache();
    io.emit("avatarUpdated", { username, avatar });
    res.json({ success: true });
}));

app.get("/api/avatar/:username", asyncRoute(async (req, res) => {
    const cached = usersCache.find(u => u.username === req.params.username);
    if (cached) return res.json({ avatar: cached.avatar || "" });
    const user = await User.findOne({ username: req.params.username }, { avatar: 1 }).lean();
    res.json({ avatar: user ? (user.avatar || "") : "" });
}));

// ===== BATCH AVATARS =====
app.post("/api/avatars/batch", asyncRoute(async (req, res) => {
    const { usernames } = req.body;
    if (!Array.isArray(usernames) || usernames.length === 0) return res.json({});
    const users = await User.find({ username: { $in: usernames } }, { username: 1, avatar: 1 }).lean();
    const result = {};
    usernames.forEach(u => { result[u] = ""; });
    users.forEach(u => { result[u.username] = u.avatar || ""; });
    res.json(result);
}));

// ===== DELETE USER (ADMIN) =====
app.post("/api/admin/delete-user", asyncRoute(async (req, res) => {
    const { adminUsername, targetUsername } = req.body;
    if (adminUsername !== ADMIN_USERNAME) return res.json({ error: "Non autorisé" });
    await User.deleteOne({ username: targetUsername });
    await Message.deleteMany({ $or: [{ from: targetUsername }, { to: targetUsername }] });
    invalidateCache();
    io.emit("userDeleted", targetUsername);
    res.json({ success: true });
}));

// ===== DELETE OWN ACCOUNT =====
app.post("/api/delete-account", asyncRoute(async (req, res) => {
    const { username } = req.body;
    await User.deleteOne({ username });
    await Message.deleteMany({ $or: [{ from: username }, { to: username }] });
    invalidateCache();
    io.emit("userDeleted", username);
    res.json({ success: true });
}));

// ===== MESSAGES REST API =====
app.get("/api/messages", asyncRoute(async (req, res) => {
    const { from, to } = req.query;
    if (!from || !to) return res.json({ error: "Paramètres manquants" });
    // Seulement les 20 derniers
    const messages = await Message.find({
        $or: [{ from, to }, { from: to, to: from }]
    }).sort({ createdAt: -1 }).limit(20).lean();
    messages.reverse();
    res.json(messages);
}));

// ===== PROFIL =====
app.get("/api/profile/:username", asyncRoute(async (req, res) => {
    const user = await User.findOne({ username: req.params.username }, { password: 0 }).lean();
    if (!user) return res.json({ error: "Utilisateur introuvable" });
    res.json(user);
}));

app.post("/api/profile", asyncRoute(async (req, res) => {
    const { username, prenom, age, profession, anniversaire, ville, situation, bio } = req.body;
    if (!username) return res.json({ error: "Username manquant" });
    await User.updateOne({ username }, { prenom, age, profession, anniversaire, ville, situation, bio });
    invalidateCache();
    res.json({ success: true });
}));

// ===== USERS LIST =====
app.get("/api/users", asyncRoute(async (req, res) => {
    const users = await getUsers();
    res.json(users);
}));

// ===== PING / WARMUP =====
app.get("/api/ping", (req, res) => res.json({ ok: true }));

app.get("/api/warmup", asyncRoute(async (req, res) => {
    await getUsers();
    res.json({ ok: true, users: usersCache.length });
}));

// ===== Gestionnaire d'erreurs =====
app.use((err, req, res, next) => {
    console.error("❌ Erreur serveur:", err);
    res.status(500).json({ error: "Erreur interne du serveur" });
});

// ===== SOCKET.IO =====
const onlineUsers = {};

io.on("connection", (socket) => {

    socket.on("join", async (username) => {
        try {
            if (!username) return;
            socket.username = username;
            onlineUsers[username] = socket.id;
            await User.updateOne({ username }, { online: true });
            invalidateCache();
            broadcastUsers();
        } catch (e) { console.error("join error:", e); }
    });

    socket.on("getUsers", async () => {
        try {
            const users = await getUsers();
            socket.emit("users", users);
        } catch (e) { console.error("getUsers error:", e); }
    });

    socket.on("privateMessage", async (data) => {
        try {
            const { from, to, text, file, fileType, id: tempId } = data;
            if (!from || !to) return;
            const saved = await Message.create({ from, to, text, file, fileType });
            const msgOut = {
                id:       saved._id.toString(),
                from, to, text, file, fileType,
                seen:     false,
                time:     new Date().toLocaleTimeString("fr-FR").slice(0, 5)
            };
            socket.emit("messageConfirmed", { tempId, msg: msgOut });
            const toSocketId = onlineUsers[to];
            if (toSocketId) {
                io.to(toSocketId).emit("privateMessage", msgOut);
                io.to(toSocketId).emit("newMessageNotification", { from, to });
            }
        } catch (e) { console.error("privateMessage error:", e); }
    });

    // Retourner seulement les 20 derniers messages
    socket.on("getHistory", async ({ from, to }) => {
        try {
            if (!from || !to) return;
            const messages = await Message.find({
                $or: [{ from, to }, { from: to, to: from }]
            }).sort({ createdAt: -1 }).limit(20).lean();
            messages.reverse();
            const formatted = messages.map(m => ({
                id:       m._id.toString(),
                from:     m.from, to: m.to,
                text:     m.text, file: m.file, fileType: m.fileType,
                seen:     m.seen,
                time:     new Date(m.createdAt).toLocaleTimeString("fr-FR").slice(0, 5)
            }));
            socket.emit("history", formatted);
        } catch (e) { console.error("getHistory error:", e); }
    });

    socket.on("seen", async ({ from, to }) => {
        try {
            await Message.updateMany({ from, to, seen: false }, { seen: true });
            const fromSocketId = onlineUsers[from];
            if (fromSocketId) {
                io.to(fromSocketId).emit("seen");
                io.to(fromSocketId).emit("messagesRead", { from, to });
            }
            socket.emit("messagesRead", { from });
        } catch (e) { console.error("seen error:", e); }
    });

    socket.on("typing", ({ from, to }) => {
        try {
            const toSocketId = onlineUsers[to];
            if (toSocketId) io.to(toSocketId).emit("typing", { from });
        } catch {}
    });

    socket.on("stopTyping", ({ from, to }) => {
        try {
            const toSocketId = onlineUsers[to];
            if (toSocketId) io.to(toSocketId).emit("stopTyping", { from });
        } catch {}
    });

    socket.on("deleteMessage", async (id) => {
        try {
            const msg = await Message.findById(id).lean();
            if (!msg) return;
            if (msg.from !== socket.username) return;
            await Message.deleteOne({ _id: id });
            socket.emit("deleteMessage", id);
            const toSocketId = onlineUsers[msg.to];
            if (toSocketId) io.to(toSocketId).emit("deleteMessage", id);
        } catch (e) { console.error("deleteMessage error:", e); }
    });

    socket.on("disconnect", async () => {
        try {
            if (socket.username) {
                delete onlineUsers[socket.username];
                await User.updateOne({ username: socket.username }, { online: false });
                invalidateCache();
                broadcastUsers();
            }
        } catch (e) { console.error("disconnect error:", e); }
    });
});

async function broadcastUsers() {
    try {
        const users = await getUsers();
        io.emit("users", users);
    } catch (e) { console.error("broadcastUsers error:", e); }
}

// ===== Keepalive Render =====
const APP_URL = process.env.APP_URL;
if (APP_URL) {
    setInterval(() => {
        fetch(APP_URL + "/api/ping").catch(() => {});
    }, 14 * 60 * 1000);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Serveur lancé sur le port ${PORT}`);
});
