// controllers/otpController.js
const Otp = require("../models/Otp");
const User = require("../models/User");
const bcrypt = require("bcryptjs");
const transporter = require("../mailer"); // ✅ centralized, verified SMTP transport

/* ─────────────────────────────────────────────────────────────
   Config & helpers
   ───────────────────────────────────────────────────────────── */
const OTP_TTL_MIN = Number(process.env.OTP_TTL_MIN || 10);  // minutes
const MAX_ATTEMPTS = 5;          // wrong-code tries before wipe
const COOLDOWN_MS = 10 * 1000;   // 10s gap between sends to same email+purpose

const now = () => new Date();
const inMinutes = (m) => new Date(Date.now() + m * 60 * 1000);

function buildOtpEmail({ purpose, otp }) {
  const subject =
    purpose === "register" ? "Verify your Talk account"
                           : "Your OTP for Talk password reset";

  const title =
    purpose === "register" ? "Email Verification OTP"
                           : "Password Reset OTP";

  const html = `
    <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
      <div style="text-align: center;">
        <img src="https://res.cloudinary.com/dgemy9u4k/image/upload/v1753100989/logo_tlk_xhdvt1.jpg" alt="Talk Logo" style="height: 80px;"/>
        <h2 style="color: #4CAF50; margin: 12px 0 0;">${title}</h2>
      </div>
      <p style="margin: 16px 0 8px;">Hello,</p>
      <p style="margin: 0 0 16px;">
        ${
          purpose === "register"
            ? "Use the OTP below to verify your email and complete your registration."
            : "Use the OTP below to reset your password."
        }
      </p>
      <div style="font-size: 28px; font-weight: 700; letter-spacing: 4px; padding: 12px 16px; background:#f2f2f2; border-radius: 8px; display:inline-block; color:#333;">
        ${otp}
      </div>
      <p style="color:#777; margin: 16px 0 0;">This OTP is valid for <strong>${OTP_TTL_MIN} minutes</strong>.</p>
      <p style="font-size:12px; color:#888; margin-top: 30px;">If you didn’t request this, please ignore this email.</p>
      <p style="font-size:12px; color:#888;">— The Talk App Team</p>
    </div>
  `;

  const text =
    (purpose === "register"
      ? "Verify your email for Talk."
      : "Reset your password for Talk.") +
    `\nYour OTP: ${otp}\nValid for ${OTP_TTL_MIN} minutes.`;

  return { subject, html, text };
}

/* ─────────────────────────────────────────────────────────────
   POST /api/otp/send
   body: { email, purpose: 'register' | 'forgot' }
   ───────────────────────────────────────────────────────────── */
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

    // Cooldown (anti-spam)
    const lastAny = await Otp.findOne({ email: emailLower, purpose }).sort({ createdAt: -1 });
    if (lastAny && lastAny.createdAt && Date.now() - lastAny.createdAt.getTime() < COOLDOWN_MS) {
      const wait = Math.ceil((COOLDOWN_MS - (Date.now() - lastAny.createdAt.getTime())) / 1000);
      return res.status(429).json({ success: false, message: `Please wait ${wait}s before requesting another OTP.` });
    }

    // Reuse existing unexpired OTP if present
    let otpDoc = await Otp.findOne({ email: emailLower, purpose, consumed: false }).sort({ createdAt: -1 });
    let otp;
    if (otpDoc && otpDoc.expiresAt && otpDoc.expiresAt.getTime() > Date.now()) {
      otp = otpDoc.otp;
    } else {
      // Create new OTP
      otp = Math.floor(100000 + Math.random() * 900000).toString();
      await Otp.deleteMany({ email: emailLower, purpose });
      otpDoc = await Otp.create({
        email: emailLower,
        otp,
        purpose,
        consumed: false,
        attempts: 0,
        createdAt: now(),
        expiresAt: inMinutes(OTP_TTL_MIN),
      });
    }

    // Send the email
    const { subject, html, text } = buildOtpEmail({ purpose, otp });
    await transporter.sendMail({
      from: process.env.SMTP_FROM,    // must be a verified sender in SendGrid
      to: emailLower,
      subject,
      html,
      text,
    });

    return res.json({ success: true, message: "OTP sent successfully" });
  } catch (err) {
    const msg = String(err?.response?.data?.errors?.[0]?.message || err?.message || err);
    if (/Invalid login|535 Authentication failed/i.test(msg)) {
      return res.status(503).json({
        success: false,
        message: "Email service auth failed. Ensure SMTP_USER=apikey and SMTP_PASS is a valid SendGrid API key.",
      });
    }
    if (/Daily user sending limit|rate|quota/i.test(msg)) {
      return res.status(503).json({ success: false, message: "Email provider rate limit reached. Try again shortly." });
    }
    return res.status(500).json({ success: false, message: msg });
  }
};

/* ─────────────────────────────────────────────────────────────
   POST /api/otp/verify   (REGISTRATION)
   body: { email, otp }
   ───────────────────────────────────────────────────────────── */
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

/* ─────────────────────────────────────────────────────────────
   POST /api/otp/reset   (FORGOT PASSWORD)
   body: { email, otp, newPassword }
   ───────────────────────────────────────────────────────────── */
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
