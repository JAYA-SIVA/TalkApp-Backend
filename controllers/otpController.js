// controllers/otpController.js
const Otp = require("../models/Otp");
const User = require("../models/User");
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");

// -----------------------------
// SMTP (SendGrid) Transporter
// -----------------------------
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.sendgrid.net",
  port: Number(process.env.SMTP_PORT || 587),
  secure: false, // STARTTLS on 587
  auth: {
    user: process.env.SMTP_USER || "apikey", // literally "apikey" for SendGrid
    pass: process.env.SMTP_PASS,             // your SendGrid API key
  },
});

// Optional: log once on boot so you know which SMTP is in use
(async () => {
  try {
    await transporter.verify();
    console.log("[MAIL] SMTP verified:", {
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      user: process.env.SMTP_USER,
      from: process.env.SMTP_FROM,
    });
  } catch (e) {
    console.error("[MAIL] SMTP verify failed:", e.message);
  }
})();

// Helpers
const now = () => new Date();
const inMinutes = (m) => new Date(Date.now() + m * 60 * 1000);

// Anti-abuse knobs (tune as you like)
const MAX_ATTEMPTS = 5;      // wrong-code tries before wipe
const OTP_TTL_MIN = 10;      // OTP validity
const COOLDOWN_MIN = 0.1667; // ≈ 10 seconds gap between sends

/**
 * POST /api/otp/send
 * body: { email, purpose: 'register' | 'forgot' }
 */
exports.sendOtp = async (req, res) => {
  try {
    const { email, purpose = "forgot" } = req.body || {};
    if (!email) return res.status(400).json({ success: false, message: "Email required" });
    if (!["register", "forgot"].includes(purpose))
      return res.status(400).json({ success: false, message: "Invalid purpose" });

    const emailLower = String(email).toLowerCase().trim();

    // Purpose guards
    if (purpose === "forgot") {
      const user = await User.findOne({ email: emailLower });
      if (!user) return res.status(404).json({ success: false, message: "Email not found" });
    } else {
      const exists = await User.findOne({ email: emailLower });
      if (exists) return res.status(409).json({ success: false, message: "Email already registered" });
    }

    // ✅ Fast path: reuse an unexpired OTP for this (email, purpose)
    const existing = await Otp.findOne({ email: emailLower, purpose, consumed: false })
                              .sort({ createdAt: -1 });

    let otp;
    if (existing && existing.expiresAt && existing.expiresAt.getTime() > Date.now()) {
      otp = existing.otp; // reuse same code
      // (optional) refresh createdAt so TTL “feels fresh”:
      // existing.createdAt = new Date(); await existing.save();
    } else {
      // ⏱️ tiny cooldown to avoid spam
      const last = await Otp.findOne({ email: emailLower, purpose }).sort({ createdAt: -1 });
      if (last && last.createdAt && Date.now() - last.createdAt.getTime() < COOLDOWN_MIN * 60 * 1000) {
        const wait = Math.ceil((COOLDOWN_MIN * 60 * 1000 - (Date.now() - last.createdAt.getTime())) / 1000);
        return res.status(429).json({ success: false, message: `Please wait ${wait}s before requesting another OTP.` });
      }

      // 🔐 create a new OTP
      otp = Math.floor(100000 + Math.random() * 900000).toString();
      await Otp.deleteMany({ email: emailLower, purpose });
      await Otp.create({
        email: emailLower,
        otp,
        purpose,
        consumed: false,
        attempts: 0,
        createdAt: now(),
        expiresAt: inMinutes(OTP_TTL_MIN),
      });
    }

    const subject = purpose === "register" ? "Verify your Talk account" : "Your OTP for Talk password reset";
    const title   = purpose === "register" ? "Email Verification OTP"   : "Password Reset OTP";

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
        <div style="text-align: center;">
          <img src="https://res.cloudinary.com/dgemy9u4k/image/upload/v1753100989/logo_tlk_xhdvt1.jpg" alt="Talk Logo" style="height: 80px;"/>
          <h2 style="color: #4CAF50;">${title}</h2>
        </div>
        <p>Hello,</p>
        <p>${purpose === "register"
          ? "Use the OTP below to verify your email and complete your registration."
          : "Use the OTP below to reset your password."}</p>
        <h1 style="background:#f2f2f2;padding:15px;border-radius:5px;text-align:center;color:#333;">${otp}</h1>
        <p style="color:#777;">This OTP is valid for <strong>${OTP_TTL_MIN} minutes</strong>.</p>
        <p style="font-size:12px;color:#888;margin-top:30px;">If you didn’t request this, please ignore this email.</p>
        <p style="font-size:12px;color:#888;">— The Talk App Team</p>
      </div>
    `;

    await transporter.sendMail({
      from: process.env.SMTP_FROM, // e.g., 'Talk App <your-verified@sender.com>'
      to: emailLower,
      subject,
      html: htmlContent,
    });

    return res.json({ success: true, message: "OTP sent successfully" });
  } catch (err) {
    const msg = String(err?.response || err?.message || err);
    return res.status(500).json({ success: false, message: msg });
  }
};

/**
 * POST /api/otp/verify   (REGISTRATION)
 * body: { email, otp }
 */
exports.verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body || {};
    if (!email || !otp) return res.status(400).json({ success: false, message: "Email and otp required" });

    const emailLower = String(email).toLowerCase().trim();

    const entry = await Otp.findOne({ email: emailLower, purpose: "register", consumed: false });
    if (!entry) return res.status(400).json({ success: false, message: "OTP not found. Please request a new one." });

    if (entry.expiresAt && entry.expiresAt.getTime() < Date.now()) {
      await Otp.deleteMany({ email: emailLower, purpose: "register" });
      return res.status(400).json({ success: false, message: "OTP expired. Please request a new one." });
    }

    if (entry.attempts >= MAX_ATTEMPTS) {
      await Otp.deleteMany({ email: emailLower, purpose: "register" });
      return res.status(429).json({ success: false, message: "Too many attempts. Please try later." });
    }

    if (entry.otp !== String(otp)) {
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

/**
 * POST /api/otp/reset   (FORGOT PASSWORD)
 * body: { email, otp, newPassword }
 */
exports.resetPasswordWithOtp = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body || {};
    if (!email || !otp || !newPassword)
      return res.status(400).json({ success: false, message: "Email, otp and newPassword required" });

    const emailLower = String(email).toLowerCase().trim();

    const entry = await Otp.findOne({ email: emailLower, purpose: "forgot", consumed: false });
    if (!entry) return res.status(400).json({ success: false, message: "OTP not found. Please request a new one." });

    if (entry.expiresAt && entry.expiresAt.getTime() < Date.now()) {
      await Otp.deleteMany({ email: emailLower, purpose: "forgot" });
      return res.status(400).json({ success: false, message: "OTP expired. Please request a new one." });
    }

    if (entry.attempts >= MAX_ATTEMPTS) {
      await Otp.deleteMany({ email: emailLower, purpose: "forgot" });
      return res.status(429).json({ success: false, message: "Too many attempts. Please try later." });
    }

    if (entry.otp !== String(otp)) {
      entry.attempts += 1;
      await entry.save();
      return res.status(400).json({ success: false, message: "Invalid OTP" });
    }

    const user = await User.findOne({ email: emailLower });
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    user.password = await bcrypt.hash(String(newPassword), 10);
    await user.save();

    entry.consumed = true;
    await entry.save();

    // Clean other consumed forgot OTPs for this email
    await Otp.deleteMany({ email: emailLower, purpose: "forgot", consumed: true });

    return res.json({ success: true, message: "Password reset successful" });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
