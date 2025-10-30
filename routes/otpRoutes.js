// routes/otpRoutes.js
const express = require("express");
const router = express.Router();

const {
  sendOtp,               // POST /api/otp/send        -> { email, purpose: 'register' | 'forgot' }
  verifyOtp,             // POST /api/otp/verify      -> { email, otp }
  resetPasswordWithOtp,  // POST /api/otp/reset       -> { email, otp, newPassword }
} = require("../controllers/otpController");

/* ─────────────────────────────────────────────
   Optional: route-only rate limit (safe if missing)
   ───────────────────────────────────────────── */
let otpLimiter = null;
try {
  const rateLimit = require("express-rate-limit");
  otpLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 5,              // 5 requests/min per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: "Too many requests, please try again later." },
  });
} catch {
  // express-rate-limit not installed; continue without limiter
}

/* ─────────────────────────────────────────────
   Lightweight body validation
   (kept inline to avoid extra deps)
   ───────────────────────────────────────────── */
const isEmail = (v = "") =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v).trim());

function guardSend(req, res, next) {
  const { email, purpose } = req.body || {};
  if (!email || !isEmail(email)) {
    return res.status(400).json({ success: false, message: "Valid email required" });
  }
  if (purpose && !["register", "forgot"].includes(String(purpose))) {
    return res.status(400).json({ success: false, message: "Invalid purpose (use 'register' or 'forgot')" });
  }
  next();
}

function guardVerify(req, res, next) {
  const { email, otp } = req.body || {};
  if (!email || !isEmail(email)) {
    return res.status(400).json({ success: false, message: "Valid email required" });
  }
  if (!otp || String(otp).trim().length < 4) {
    return res.status(400).json({ success: false, message: "Valid otp required" });
  }
  next();
}

function guardReset(req, res, next) {
  const { email, otp, newPassword } = req.body || {};
  if (!email || !isEmail(email)) {
    return res.status(400).json({ success: false, message: "Valid email required" });
  }
  if (!otp || String(otp).trim().length < 4) {
    return res.status(400).json({ success: false, message: "Valid otp required" });
  }
  if (!newPassword || String(newPassword).length < 6) {
    return res.status(400).json({ success: false, message: "newPassword must be at least 6 characters" });
  }
  next();
}

/* ─────────────────────────────────────────────
   Routes
   ───────────────────────────────────────────── */
const chain = otpLimiter ? [otpLimiter] : [];

router.post("/send", ...chain, guardSend, sendOtp);
router.post("/verify", ...chain, guardVerify, verifyOtp);
router.post("/reset", ...chain, guardReset, resetPasswordWithOtp);

module.exports = router;
