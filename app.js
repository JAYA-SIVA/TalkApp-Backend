// app.js
const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const dotenv = require("dotenv");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const morgan = require("morgan");

// Load env FIRST
dotenv.config();

/* ──────────────────────────────
   📧 Mail diagnostics (no secrets)
   ────────────────────────────── */
function logMailConfig() {
  const safe = {
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    user: process.env.SMTP_USER,
    from: process.env.SMTP_FROM,
  };
  console.log("📧 MAIL CONFIG =>", safe);
}
logMailConfig();

// Centralized mailer (does its own verify on boot)
const mailer = require("./mailer");

/* ──────────────────────────────
   ✅ MongoDB Connection (Mongoose 7/8 style)
   ────────────────────────────── */
(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ MongoDB connected");
  } catch (err) {
    console.error("❌ MongoDB connection failed:", err.message);
    process.exit(1);
  }
})();

mongoose.connection.on("error", (err) => {
  console.error("❌ Mongo error:", err.message);
});
mongoose.connection.on("disconnected", () => {
  console.warn("⚠️ Mongo disconnected");
});

/* ──────────────────────────────
   ✅ Express + HTTP + Socket.IO
   ────────────────────────────── */
const app = express();
const server = http.createServer(app);

const io = socketIo(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || "*", // ⚠️ set exact domain(s) in prod
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    credentials: true,
  },
});

// Make io available everywhere (controllers/utils)
app.set("io", io);
global.io = io;

// Trust reverse proxies (Render/Heroku/Nginx)
app.set("trust proxy", 1);

/* ──────────────────────────────
   ✅ Middleware
   ────────────────────────────── */
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }, // allow images from Cloudinary/CDN
  })
);
app.use(compression());
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "*",
    credentials: true,
  })
);

// Preflight for all routes
app.options(
  "*",
  cors({
    origin: process.env.CORS_ORIGIN || "*",
    credentials: true,
  })
);

// Keep JSON size sane (media should use multer/cloudinary, not JSON)
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true, limit: "5mb" }));

/* ──────────────────────────────
   🧪 Optional SMTP test route (enable by setting ENABLE_MAILTEST=1)
   ────────────────────────────── */
if (process.env.ENABLE_MAILTEST === "1") {
  app.get("/_mailtest", async (_req, res) => {
    try {
      const to =
        (process.env.SMTP_FROM && process.env.SMTP_FROM.match(/<(.+)>/)?.[1]) ||
        process.env.SMTP_FROM;

      await mailer.sendMail({
        from: process.env.SMTP_FROM,
        to: to || process.env.SMTP_FROM,
        subject: "SendGrid OK (Talk App)",
        text: "If you received this, SendGrid SMTP is working.",
      });
      res.send("OK: test email sent");
    } catch (e) {
      res.status(500).send("Mail test failed: " + String(e?.message || e));
    }
  });
}

/* ──────────────────────────────
   ⛔ Optional: OTP rate-limit (only if express-rate-limit is installed)
   ────────────────────────────── */
let otpLimiter = null;
try {
  const rateLimit = require("express-rate-limit");
  otpLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 5,              // 5 OTP ops/min per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: "Too many requests, please try again later." },
  });
} catch {
  // express-rate-limit not installed; skip gracefully
}

/* ──────────────────────────────
   ✅ Health Checks
   ────────────────────────────── */
app.get("/", (_req, res) => {
  res.status(200).send("🚀 Talk App API is running with Socket.IO ✅");
});
app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true, ts: Date.now() });
});

/* ──────────────────────────────
   ✅ Routes (mounted under /api)
   ────────────────────────────── */
const apiRouter = express.Router();

// mount non-OTP first
apiRouter.use("/auth", require("./routes/auth"));
apiRouter.use("/user", require("./routes/userRoutes"));
apiRouter.use("/chat", require("./routes/chatRoutes"));
apiRouter.use("/message", require("./routes/messageRoutes"));
apiRouter.use("/notifications", require("./routes/notificationRoutes"));
apiRouter.use("/posts", require("./routes/postRoutes"));
apiRouter.use("/reels", require("./routes/reelRoutes"));
apiRouter.use("/story", require("./routes/storyRoutes"));
apiRouter.use("/bookmarks", require("./routes/bookmarkRoutes"));
apiRouter.use("/admin", require("./routes/admin"));
apiRouter.use("/moderation", require("./routes/moderationRoutes"));
apiRouter.use("/talk", require("./routes/talk"));

// OTP routes (with optional limiter applied just to this sub-tree)
if (otpLimiter) {
  apiRouter.use("/otp", otpLimiter, require("./routes/otpRoutes"));
} else {
  apiRouter.use("/otp", require("./routes/otpRoutes"));
}

app.use("/api", apiRouter);

/* ──────────────────────────────
   ✅ Socket.IO
   ────────────────────────────── */
io.on("connection", (socket) => {
  console.log("🔌 Client connected:", socket.id);

  socket.on("setup", (userData) => {
    try {
      const uid = userData?._id || userData?.id;
      if (!uid) return;
      socket.join(String(uid));
      console.log("👤 joined personal room:", uid);
      socket.emit("connected");
    } catch (e) {
      /* no-op */
    }
  });

  socket.on("register", (userId) => {
    if (!userId) return;
    socket.join(String(userId));
    console.log("👤 registered room:", userId);
    socket.emit("connected");
  });

  socket.on("join chat", (roomId) => {
    if (!roomId) return;
    socket.join(String(roomId));
    console.log("💬 joined chat:", roomId);
  });

  socket.on("typing", (room) => room && socket.to(String(room)).emit("typing"));
  socket.on("stop typing", (room) => room && socket.to(String(room)).emit("stop typing"));

  socket.on("new message", (message) => {
    const chat = message?.chat;
    if (!chat?.users) return;
    chat.users.forEach((user) => {
      if (String(user._id) === String(message.sender?._id)) return;
      socket.to(String(user._id)).emit("message received", message);
      socket.to(String(user._id)).emit("chat updated", message);
    });
  });

  socket.on("message read", ({ chatId, messageId, readerId }) => {
    if (!chatId) return;
    socket.to(String(chatId)).emit("message read", { messageId, readerId });
  });

  socket.on("message delivered", ({ chatId, messageId, userId }) => {
    if (!chatId) return;
    socket.to(String(chatId)).emit("message delivered", { messageId, userId });
  });

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
  res.status(err.status || 500).json({ message: "Server error", error: err.message });
});

/* ──────────────────────────────
   ✅ Start Server + Graceful Shutdown
   ────────────────────────────── */
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`✅ Server is live on PORT: ${PORT}`);
});

const shutdown = async (signal) => {
  console.log(`\n${signal} received, closing gracefully...`);
  try {
    await mongoose.connection.close();
    server.close(() => {
      console.log("🛑 HTTP server closed, bye!");
      process.exit(0);
    });
  } catch (e) {
    console.error("Force exit due to error:", e);
    process.exit(1);
  }
};
["SIGINT", "SIGTERM"].forEach((sig) => process.on(sig, () => shutdown(sig)));

module.exports = app;
