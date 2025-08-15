// controllers/authController.js
const User = require("../models/User");
const Otp = require("../models/Otp");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

// ⚠️ In-memory store for refresh tokens (replace with DB/Redis in production)
let refreshTokens = [];

/* -------------------------- Token helpers -------------------------- */
const ACCESS_SECRET  = (process.env.ACCESS_TOKEN_SECRET  || "fallback_access_secret").trim();
const REFRESH_SECRET = (process.env.REFRESH_TOKEN_SECRET || "fallback_refresh_secret").trim();
const ACCESS_TTL  = process.env.ACCESS_TOKEN_EXPIRES_IN  || "15m";
const REFRESH_TTL = process.env.REFRESH_TOKEN_EXPIRES_IN || "30d";

const generateTokens = (user) => {
  const payload = { id: user._id, username: user.username };
  const accessToken  = jwt.sign(payload, ACCESS_SECRET,  { expiresIn: ACCESS_TTL });
  const refreshToken = jwt.sign(payload, REFRESH_SECRET, { expiresIn: REFRESH_TTL });
  return { accessToken, refreshToken };
};

const sanitizeUser = (u) => {
  const obj = u.toObject ? u.toObject() : { ...u };
  delete obj.password;
  return obj;
};

/* ------------------------------ Register ------------------------------ */
/**
 * Requires a previously verified REGISTER OTP:
 * OTP doc must exist with { email, purpose:'register', consumed:true }.
 */
exports.registerUser = async (req, res) => {
  try {
    const { username, email, password, profilePic } = req.body || {};
    if (!username || !email || !password) {
      return res.status(400).json({ success: false, message: "All fields (username, email, password) are required." });
    }

    const emailLower = String(email).toLowerCase().trim();

    // Reject if already taken (case-insensitive)
    const [emailTaken, usernameTaken] = await Promise.all([
      User.findOne({ email: new RegExp(`^${emailLower}$`, "i") }).lean(),
      User.findOne({ username: new RegExp(`^${username}$`, "i") }).lean(),
    ]);
    if (emailTaken)    return res.status(400).json({ success: false, message: "Email already registered" });
    if (usernameTaken) return res.status(400).json({ success: false, message: "Username already taken" });

    // ✅ Require a consumed register OTP
    const verified = await Otp.findOne({
      email: emailLower,
      purpose: "register",
      consumed: true,
    }).sort({ createdAt: -1 });

    if (!verified) {
      return res.status(400).json({
        success: false,
        message: "Please verify the OTP sent to your email before registering"
      });
    }

    // Create account
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await User.create({
      username,
      email: emailLower,
      password: hashedPassword,
      profilePic: profilePic || undefined,
      // emailVerified: true, // uncomment if your schema has this field
    });

    // Invalidate any register OTPs for this email
    await Otp.deleteMany({ email: emailLower, purpose: "register" });

    // Tokens
    const tokens = generateTokens(newUser);
    refreshTokens.push(tokens.refreshToken);

    return res.status(201).json({
      success: true,
      message: "Registered successfully",
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: sanitizeUser(newUser),
    });
  } catch (err) {
    console.error("Registration error:", err);
    return res.status(500).json({ success: false, message: "Registration error" });
  }
};

/* -------------------------------- Login -------------------------------- */
/**
 * Accepts either email or username in the `email` field for compatibility.
 * Safe bcrypt flow; generic errors to avoid leaking info.
 */
exports.loginUser = async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Email/username and password are required." });
    }

    const qEmail = { email: new RegExp(`^${email}$`, "i") };
    const qUser  = { username: new RegExp(`^${email}$`, "i") };

    let user = await User.findOne(qEmail).select("+password");
    if (!user) user = await User.findOne(qUser).select("+password");
    if (!user) return res.status(400).json({ success: false, message: "Invalid credentials" });

    // Guard malformed docs that might not have a proper hash
    if (typeof user.password !== "string" || user.password.length < 20) {
      return res.status(400).json({
        success: false,
        message: "This account has no valid password. Please reset your password."
      });
    }

    let ok = false;
    try {
      ok = await bcrypt.compare(password, user.password);
    } catch (e) {
      console.error("bcrypt.compare error:", e.message);
      return res.status(400).json({ success: false, message: "Invalid credentials" });
    }
    if (!ok) return res.status(400).json({ success: false, message: "Invalid credentials" });

    const tokens = generateTokens(user);
    refreshTokens.push(tokens.refreshToken);

    return res.status(200).json({
      success: true,
      message: "Logged in",
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: sanitizeUser(user),
    });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ success: false, message: "Login error" });
  }
};

/* ----------------------------- Refresh token ---------------------------- */
/**
 * Accepts body.refreshToken OR body.token OR header x-refresh-token
 * Responds with { success, accessToken }
 */
exports.refreshToken = (req, res) => {
  const token =
    req.body?.refreshToken ||
    req.body?.token ||
    req.headers["x-refresh-token"];

  if (!token) return res.status(401).json({ success: false, message: "Refresh token required" });
  if (!refreshTokens.includes(token)) return res.status(403).json({ success: false, message: "Invalid refresh token" });

  jwt.verify(token, REFRESH_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ success: false, message: "Token expired or invalid" });

    const accessToken = jwt.sign(
      { id: decoded.id, username: decoded.username },
      ACCESS_SECRET,
      { expiresIn: ACCESS_TTL }
    );
    return res.status(200).json({ success: true, accessToken });
  });
};

/* -------------------------------- Logout -------------------------------- */
exports.logout = (req, res) => {
  const token = req.body?.refreshToken || req.body?.token;
  if (!token) return res.status(400).json({ success: false, message: "Refresh token missing" });
  refreshTokens = refreshTokens.filter((t) => t !== token);
  return res.status(200).json({ success: true, message: "Logged out successfully" });
};
