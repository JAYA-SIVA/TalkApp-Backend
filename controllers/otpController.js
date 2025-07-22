const Otp = require("../models/Otp");
const User = require("../models/User");
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");

// 🔐 Gmail Transporter
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// ✅ Send OTP Email with HTML Template
exports.sendOtp = async (req, res) => {
  const { email } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "Email not found" });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    await Otp.deleteMany({ email }); // Clean up existing OTPs
    await Otp.create({ email, otp, createdAt: Date.now(), attempts: 0 });

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
        <div style="text-align: center;">
          <img src="https://res.cloudinary.com/dgemy9u4k/image/upload/v1753100989/logo_tlk_xhdvt1.jpg" alt="Talk Logo" style="height: 80px;"/>
          <h2 style="color: #4CAF50;">Password Reset OTP</h2>
        </div>
        <p>Hello <strong>${user.username}</strong>,</p>
        <p>You requested to reset your password. Use the OTP below:</p>
        <h1 style="background: #f2f2f2; padding: 15px; border-radius: 5px; text-align: center; color: #333;">${otp}</h1>
        <p style="color: #777;">This OTP is valid for <strong>5 minutes</strong>.</p>
        <div style="text-align: center; margin-top: 20px;">
          <a href="#" style="background-color: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Open Talk App</a>
        </div>
        <p style="font-size: 12px; color: #888; margin-top: 30px;">If you didn’t request this, please ignore this email.</p>
        <p style="font-size: 12px; color: #888;">— The Talk App Team</p>
      </div>
    `;

    await transporter.sendMail({
      from: `"Talk App" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "🔐 Your OTP for Password Reset",
      html: htmlContent
    });

    res.json({ message: "OTP sent to email" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ✅ Verify OTP and Reset Password
exports.verifyOtpAndResetPassword = async (req, res) => {
  const { email, otp, newPassword } = req.body;

  try {
    const otpEntry = await Otp.findOne({ email });
    if (!otpEntry) return res.status(400).json({ message: "OTP expired or not found" });

    // Expiry Check
    const now = Date.now();
    const createdAt = new Date(otpEntry.createdAt).getTime();
    if (now - createdAt > 5 * 60 * 1000) {
      await Otp.deleteMany({ email });
      return res.status(400).json({ message: "OTP expired. Please try again." });
    }

    // Attempt Limit Check
    if (otpEntry.attempts >= 5) {
      await Otp.deleteMany({ email });
      return res.status(429).json({ message: "Too many failed attempts. Try later." });
    }

    // Invalid OTP
    if (otpEntry.otp !== otp) {
      otpEntry.attempts += 1;
      await otpEntry.save();
      return res.status(400).json({ message: "Invalid OTP" });
    }

    // ✅ Valid OTP
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "User not found" });

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    await Otp.deleteMany({ email });

    res.json({ message: "Password reset successful" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
