// controllers/otpController.js  (drop-in replacement for your file)
const Otp = require("../models/Otp");
const User = require("../models/User");
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");

// ───────────────── Config ─────────────────
const MAX_ATTEMPTS = 5;
const OTP_TTL_MIN = 10;
const RESEND_COOLDOWN_SEC = 45; // prevent spamming "send OTP"
const HASH_OTP = true;          // set to false to keep plaintext OTP storage

// ────────────── Mailer (Gmail App Password) ──────────────
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
});

// ────────────── Small helpers ──────────────
const now = () => new Date();
const inMinutes = (m) => new Date(Date.now() + m * 60 * 1000);
const isEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || "").trim());

function safeOk() {
  // Generic success response that avoids leaking user existence
  return { success: true, message: "If the email is valid, an OTP will be sent (if eligible)." };
}

// ────────────── SEND OTP ──────────────
// POST /api/otp/send   { email, purpose: 'register' | 'forgot' }
exports.sendOtp = async (req, res) => {
  try {
    let { email, purpose = "forgot" } = req.body || {};
    if (!email) return res.status(400).json({ success: false, message: "Email required" });
    if (!isEmail(email)) return res.status(400).json({ success: false, message: "Invalid email" });
    purpose = String(purpose).toLowerCase().trim();
    if (!["register", "forgot"].includes(purpose)) {
      return res.status(400).json({ success: false, message: "Invalid purpose" });
    }

    const emailLower = String(email).toLowerCase().trim();

    // Existence checks (control leakage)
    const user = await User.findOne({ email: emailLower }).select("_id");
    if (purpose === "forgot") {
      // Don’t reveal if user exists; reply generic success either way.
      if (!user) return res.json(safeOk());
    } else {
      // register: block if already registered
      if (user) return res.status(409).json({ success: false, message: "Email already registered" });
    }

    // Rate limit: enforce resend cooldown per (email,purpose)
    const recent = await Otp.findOne({ email: emailLower, purpose })
      .sort({ createdAt: -1 })
      .select("createdAt");
    if (recent && Date.now() - recent.createdAt.getTime() < RESEND_COOLDOWN_SEC * 1000) {
      const wait = Math.ceil((RESEND_COOLDOWN_SEC * 1000 - (Date.now() - recent.createdAt.getTime())) / 1000);
      return res.status(429).json({ success: false, message: `Please wait ${wait}s before requesting a new OTP.` });
    }

    // Generate 6-digit OTP
    const rawOtp = Math.floor(100000 + Math.random() * 900000).toString();

    // Ensure single active OTP for this (email,purpose)
    await Otp.deleteMany({ email: emailLower, purpose });

    // Hash OTP (recommended)
    let otpToStore = rawOtp;
    if (HASH_OTP) {
      const salt = await bcrypt.genSalt(10);
      otpToStore = await bcrypt.hash(rawOtp, salt);
    }

    await Otp.create({
      email: emailLower,
      otp: otpToStore,          // hashed if HASH_OTP = true
      purpose,
      consumed: false,
      attempts: 0,
      createdAt: now(),
      expiresAt: inMinutes(OTP_TTL_MIN),
    });

    const subject = purpose === "register" ? "Verify your Talk account" : "Your OTP for Talk password reset";
    const title   = purpose === "register" ? "Email Verification OTP" : "Password Reset OTP";

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
        <div style="text-align: center;">
          <img src="https://res.cloudinary.com/dgemy9u4k/image/upload/v1753100989/logo_tlk_xhdvt1.jpg" alt="Talk Logo" style="height: 80px;"/>
          <h2 style="color: #4CAF50;">${title}</h2>
        </div>
        <p>Hello,</p>
        <p>${purpose === "register"
          ? "Use the OTP below to verify your email and complete your registration."
          : "Use the OTP below to reset your password."}
        </p>
        <h1 style="background: #f2f2f2; padding: 15px; border-radius: 5px; text-align: center; color: #333;">${rawOtp}</h1>
        <p style="color: #777;">This OTP is valid for <strong>${OTP_TTL_MIN} minutes</strong>.</p>
        <p style="font-size: 12px; color: #888; margin-top: 30px;">If you didn’t request this, please ignore this email.</p>
        <p style="font-size: 12px; color: #888;">— The Talk App Team</p>
      </div>
    `;

    try {
      await transporter.sendMail({
        from: `"Talk App" <${process.env.EMAIL_USER}>`,
        to: emailLower,
        subject,
        html: htmlContent,
      });
    } catch (mailErr) {
      // If sending fails, clean the OTP to avoid orphaned entries
      await Otp.deleteMany({ email: emailLower, purpose });
      return res.status(502).json({ success: false, message: "Failed to send email, please try again." });
    }

    // Return generic for forgot (no enumeration)
    if (purpose === "forgot") return res.json(safeOk());
    return res.json({ success: true, message: "OTP sent successfully" });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ────────────── VERIFY (REGISTER) ──────────────
// POST /api/otp/verify   { email, otp }
exports.verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body || {};
    if (!email || !otp) return res.status(400).json({ success: false, message: "Email and otp required" });
    if (!isEmail(email)) return res.status(400).json({ success: false, message: "Invalid email" });

    const emailLower = String(email).toLowerCase().trim();

    let entry = await Otp.findOne({ email: emailLower, purpose: "register", consumed: false })
      .sort({ createdAt: -1 });

    if (!entry) {
      return res.status(400).json({ success: false, message: "OTP not found. Please request a new one." });
    }

    if (entry.expiresAt && entry.expiresAt.getTime() < Date.now()) {
      await Otp.deleteMany({ email: emailLower, purpose: "register" });
      return res.status(400).json({ success: false, message: "OTP expired. Please request a new one." });
    }

    if (entry.attempts >= MAX_ATTEMPTS) {
      await Otp.deleteMany({ email: emailLower, purpose: "register" });
      return res.status(429).json({ success: false, message: "Too many attempts. Please try later." });
    }

    // Compare OTP (supports hashed/plain)
    let match;
    if (HASH_OTP) {
      match = await bcrypt.compare(String(otp), entry.otp);
    } else {
      match = entry.otp === String(otp);
    }
    if (!match) {
      entry.attempts += 1;
      await entry.save();
      return res.status(400).json({ success: false, message: "Invalid OTP" });
    }

    entry.consumed = true;
    await entry.save();

    return res.json({ success: true, message: "Email verified" });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ────────────── RESET PASSWORD (FORGOT) ──────────────
// POST /api/otp/reset   { email, otp, newPassword }
exports.resetPasswordWithOtp = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body || {};
    if (!email || !otp || !newPassword) {
      return res.status(400).json({ success: false, message: "Email, otp and newPassword required" });
    }
    if (!isEmail(email)) return res.status(400).json({ success: false, message: "Invalid email" });
    if (String(newPassword).length < 6) {
      return res.status(400).json({ success: false, message: "Password must be at least 6 characters." });
    }

    const emailLower = String(email).toLowerCase().trim();

    let entry = await Otp.findOne({ email: emailLower, purpose: "forgot", consumed: false })
      .sort({ createdAt: -1 });

    if (!entry) return res.status(400).json({ success: false, message: "OTP not found. Please request a new one." });

    if (entry.expiresAt && entry.expiresAt.getTime() < Date.now()) {
      await Otp.deleteMany({ email: emailLower, purpose: "forgot" });
      return res.status(400).json({ success: false, message: "OTP expired. Please request a new one." });
    }

    if (entry.attempts >= MAX_ATTEMPTS) {
      await Otp.deleteMany({ email: emailLower, purpose: "forgot" });
      return res.status(429).json({ success: false, message: "Too many attempts. Please try later." });
    }

    // Compare OTP (supports hashed/plain)
    let match;
    if (HASH_OTP) {
      match = await bcrypt.compare(String(otp), entry.otp);
    } else {
      match = entry.otp === String(otp);
    }
    if (!match) {
      entry.attempts += 1;
      await entry.save();
      return res.status(400).json({ success: false, message: "Invalid OTP" });
    }

    const user = await User.findOne({ email: emailLower });
    // Don’t leak more info—generic if missing (shouldn’t happen if you control forgot flow)
    if (!user) {
      // consume current OTP to avoid reuse
      entry.consumed = true;
      await entry.save();
      return res.json({ success: true, message: "Password reset successful" });
    }

    user.password = await bcrypt.hash(String(newPassword), 10);
    await user.save();

    entry.consumed = true;
    await entry.save();

    // clean all consumed/old forgot OTPs for this email
    await Otp.deleteMany({ email: emailLower, purpose: "forgot", consumed: true });

    return res.json({ success: true, message: "Password reset successful" });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
