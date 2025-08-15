const Otp = require("../models/Otp");
const User = require("../models/User");
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");

// 🔐 Gmail Transporter
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
});

// Helpers
const now = () => new Date();
const inMinutes = (m) => new Date(Date.now() + m * 60 * 1000);
const MAX_ATTEMPTS = 5;
const OTP_TTL_MIN = 10;

/**
 * POST /api/otp/send
 * body: { email, purpose: 'register' | 'forgot' }
 *  - register: send OTP even if user doesn't exist (and prefer to block if it DOES exist)
 *  - forgot:   only send if user exists
 */
exports.sendOtp = async (req, res) => {
  try {
    const { email, purpose = "forgot" } = req.body || {};
    if (!email) return res.status(400).json({ success: false, message: "Email required" });
    if (!["register", "forgot"].includes(purpose))
      return res.status(400).json({ success: false, message: "Invalid purpose" });

    const emailLower = String(email).toLowerCase().trim();

    if (purpose === "forgot") {
      const user = await User.findOne({ email: emailLower });
      if (!user) return res.status(404).json({ success: false, message: "Email not found" });
    } else if (purpose === "register") {
      // Optional guard: don't allow OTP if already registered
      const exists = await User.findOne({ email: emailLower });
      if (exists) return res.status(409).json({ success: false, message: "Email already registered" });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // One active OTP per (email, purpose)
    await Otp.deleteMany({ email: emailLower, purpose });
    await Otp.create({
      email: emailLower,
      otp,
      purpose,
      consumed: false,
      attempts: 0,
      createdAt: now(),
      expiresAt: inMinutes(OTP_TTL_MIN)
    });

    const subject =
      purpose === "register"
        ? "Verify your Talk account"
        : "Your OTP for Talk password reset";

    const title =
      purpose === "register"
        ? "Email Verification OTP"
        : "Password Reset OTP";

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
        <h1 style="background: #f2f2f2; padding: 15px; border-radius: 5px; text-align: center; color: #333;">${otp}</h1>
        <p style="color: #777;">This OTP is valid for <strong>${OTP_TTL_MIN} minutes</strong>.</p>
        <p style="font-size: 12px; color: #888; margin-top: 30px;">If you didn’t request this, please ignore this email.</p>
        <p style="font-size: 12px; color: #888;">— The Talk App Team</p>
      </div>
    `;

    await transporter.sendMail({
      from: `"Talk App" <${process.env.EMAIL_USER}>`,
      to: emailLower,
      subject,
      html: htmlContent
    });

    return res.json({ success: true, message: "OTP sent successfully" });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * POST /api/otp/verify   (REGISTRATION)
 * body: { email, otp }
 * - marks OTP as consumed if valid (purpose='register')
 * - does NOT change password
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

    // clean any other forgot OTPs for this email
    await Otp.deleteMany({ email: emailLower, purpose: "forgot", consumed: true });

    return res.json({ success: true, message: "Password reset successful" });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
