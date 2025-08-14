// controllers/authController.js
const User = require("../models/User");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

// ⚠️ In-memory store (replace with DB/Redis in production)
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

/* ------------------------------ Register ------------------------------ */
exports.registerUser = async (req, res) => {
  try {
    const { username, email, password } = req.body || {};
    if (!username || !email || !password) {
      return res.status(400).json({ message: "All fields (username, email, password) are required." });
    }

    // Case-insensitive uniqueness checks
    const [emailTaken, usernameTaken] = await Promise.all([
      User.findOne({ email: new RegExp(`^${email}$`, "i") }).lean(),
      User.findOne({ username: new RegExp(`^${username}$`, "i") }).lean(),
    ]);
    if (emailTaken)    return res.status(400).json({ message: "Email already registered" });
    if (usernameTaken) return res.status(400).json({ message: "Username already taken" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await User.create({ username, email, password: hashedPassword });

    const tokens = generateTokens(newUser);
    refreshTokens.push(tokens.refreshToken);

    return res.status(201).json({
      _id: newUser._id,
      username: newUser.username,
      email: newUser.email,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });
  } catch (err) {
    console.error("Registration error:", err);
    return res.status(500).json({ message: "Registration error" });
  }
};

/* -------------------------------- Login -------------------------------- */
/**
 * Accepts either email or username in the `email` field for compatibility.
 * Fixes bcrypt crash by:
 *  - explicitly selecting password: .select("+password")
 *  - guarding when password is missing/invalid
 */
exports.loginUser = async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ message: "Email/username and password are required." });
    }

    const qEmail = { email: new RegExp(`^${email}$`, "i") };
    const qUser  = { username: new RegExp(`^${email}$`, "i") };

    // Always select password explicitly in case schema ever hides it
    let user = await User.findOne(qEmail).select("+password");
    if (!user) user = await User.findOne(qUser).select("+password");

    // Generic message avoids leaking which part failed
    if (!user) return res.status(400).json({ message: "Invalid credentials" });

    // Guard: if legacy/malformed doc has no password, do not call bcrypt
    if (typeof user.password !== "string" || user.password.length < 20) {
      return res.status(400).json({
        message: "This account has no valid password. Please reset your password."
      });
    }

    let ok = false;
    try {
      ok = await bcrypt.compare(password, user.password);
    } catch (e) {
      console.error("bcrypt.compare error:", e.message);
      return res.status(400).json({ message: "Invalid credentials" });
    }
    if (!ok) return res.status(400).json({ message: "Invalid credentials" });

    const tokens = generateTokens(user);
    refreshTokens.push(tokens.refreshToken);

    return res.status(200).json({
      _id: user._id,
      username: user.username,
      email: user.email,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ message: "Login error" });
  }
};

/* ----------------------------- Refresh token ---------------------------- */
exports.refreshToken = (req, res) => {
  const token = req.body?.refreshToken || req.headers["x-refresh-token"];
  if (!token) return res.status(401).json({ message: "Refresh token required" });
  if (!refreshTokens.includes(token)) return res.status(403).json({ message: "Invalid refresh token" });

  jwt.verify(token, REFRESH_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ message: "Token expired or invalid" });
    const accessToken = jwt.sign(
      { id: decoded.id, username: decoded.username },
      ACCESS_SECRET,
      { expiresIn: ACCESS_TTL }
    );
    return res.status(200).json({ accessToken });
  });
};

/* -------------------------------- Logout -------------------------------- */
exports.logout = (req, res) => {
  const token = req.body?.refreshToken;
  if (!token) return res.status(400).json({ message: "Refresh token missing" });
  refreshTokens = refreshTokens.filter((t) => t !== token);
  return res.status(200).json({ message: "Logged out successfully" });
};
