// app.js
const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const dotenv = require("dotenv");
const mongoose = require("mongoose");
const cors = require("cors");

dotenv.config();

/* ──────────────────────────────
   ✅ MongoDB Connection
   ────────────────────────────── */
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => {
    console.error("❌ MongoDB connection failed:", err.message);
    process.exit(1);
  });

/* ──────────────────────────────
   ✅ Express + HTTP + Socket.IO
   ────────────────────────────── */
const app = express();
const server = http.createServer(app);

const io = socketIo(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || "*", // ⚠️ set your app URL in prod
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    credentials: true,
  },
});

// Make io available everywhere (controllers/utils)
app.set("io", io);
global.io = io;

/* ──────────────────────────────
   ✅ Middleware
   ────────────────────────────── */
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "*",
    credentials: true,
  })
);
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true }));

/* ──────────────────────────────
   ✅ Routes
   ────────────────────────────── */
const apiRouter = express.Router();

apiRouter.use("/auth", require("./routes/auth"));
apiRouter.use("/user", require("./routes/userRoutes"));
apiRouter.use("/otp", require("./routes/otpRoutes"));
apiRouter.use("/chat", require("./routes/chatRoutes"));
apiRouter.use("/message", require("./routes/messageRoutes"));
apiRouter.use("/notifications", require("./routes/notificationRoutes"));
apiRouter.use("/posts", require("./routes/postRoutes")); // (if you keep a separate posts router)
apiRouter.use("/reels", require("./routes/reelRoutes"));
apiRouter.use("/story", require("./routes/storyRoutes"));
apiRouter.use("/bookmarks", require("./routes/bookmarkRoutes"));
apiRouter.use("/admin", require("./routes/admin"));
apiRouter.use("/moderation", require("./routes/moderationRoutes"));
apiRouter.use("/talk", require("./routes/talk")); // your feed/talk routes

// Mount everything under /api
app.use("/api", apiRouter);

/* ──────────────────────────────
   ✅ Health Check
   ────────────────────────────── */
app.get("/", (_req, res) => {
  res.status(200).send("🚀 Talk App API is running with Socket.IO ✅");
});

/* ──────────────────────────────
   ✅ Socket.IO
   ────────────────────────────── */
io.on("connection", (socket) => {
  console.log("🔌 Client connected:", socket.id);

  // Preferred: client emits { _id: "userId", ... }
  socket.on("setup", (userData) => {
    const uid = userData?._id || userData?.id;
    if (!uid) return;
    socket.join(uid);
    console.log("👤 joined personal room:", uid);
    socket.emit("connected");
  });

  // Fallback: simple string userId
  socket.on("register", (userId) => {
    if (!userId) return;
    socket.join(String(userId));
    console.log("👤 registered room:", userId);
    socket.emit("connected");
  });

  // Chat rooms
  socket.on("join chat", (roomId) => {
    if (!roomId) return;
    socket.join(String(roomId));
    console.log("💬 joined chat:", roomId);
  });

  // Typing
  socket.on("typing", (room) => room && socket.to(room).emit("typing"));
  socket.on("stop typing", (room) => room && socket.to(room).emit("stop typing"));

  // New message
  socket.on("new message", (message) => {
    const chat = message?.chat;
    if (!chat?.users) return;

    chat.users.forEach((user) => {
      if (String(user._id) === String(message.sender?._id)) return;
      socket.to(String(user._id)).emit("message received", message);
      socket.to(String(user._id)).emit("chat updated", message);
    });
  });

  // Read / Delivered (optional)
  socket.on("message read", ({ chatId, messageId, readerId }) => {
    if (!chatId) return;
    socket.to(String(chatId)).emit("message read", { messageId, readerId });
  });

  socket.on("message delivered", ({ chatId, messageId, userId }) => {
    if (!chatId) return;
    socket.to(String(chatId)).emit("message delivered", { messageId, userId });
  });

  // (Optional) explicit subscribe to notifications
  socket.on("notifications:subscribe", (userId) => {
    if (!userId) return;
    socket.join(String(userId));
    console.log("🔔 notifications subscribed:", userId);
  });

  socket.on("disconnect", () => {
    console.log("❌ Disconnected:", socket.id);
  });
});

/* ──────────────────────────────
   ❌ 404 + Error handler (basic)
   ────────────────────────────── */
app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

app.use((err, _req, res, _next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ message: "Server error", error: err.message });
});

/* ──────────────────────────────
   ✅ Start Server
   ────────────────────────────── */
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`✅ Server is live on PORT: ${PORT}`);
});
