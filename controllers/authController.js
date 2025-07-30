const User = require("../models/User");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

// ⚠️ In-memory store for refresh tokens (in production, use Redis or DB)
let refreshTokens = [];

// ✅ Generate Access and Refresh Tokens
const generateTokens = (user) => {
  const payload = { id: user._id, username: user.username };

  const accessToken = jwt.sign(payload, process.env.ACCESS_TOKEN_SECRET, {
    expiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN || "15m",
  });

  const refreshToken = jwt.sign(payload, process.env.REFRESH_TOKEN_SECRET, {
    expiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || "30d",
  });

  return { accessToken, refreshToken };
};

// ✅ Register User
exports.registerUser = async (req, res) => {
  const { username, email, password } = req.body;

  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "Email already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await User.create({
      username,
      email,
      password: hashedPassword,
    });

    const tokens = generateTokens(newUser);
    refreshTokens.push(tokens.refreshToken); // Save refresh token in memory

    res.status(201).json({
      _id: newUser._id,
      username: newUser.username,
      email: newUser.email,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });
  } catch (err) {
    res.status(500).json({ message: "Registration error: " + err.message });
  }
};

// ✅ Login User
exports.loginUser = async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "User not found" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: "Invalid credentials" });

    const tokens = generateTokens(user);
    refreshTokens.push(tokens.refreshToken); // Save new refresh token

    res.status(200).json({
      _id: user._id,
      username: user.username,
      email: user.email,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });
  } catch (err) {
    res.status(500).json({ message: "Login error: " + err.message });
  }
};

// 🔁 Refresh Access Token
exports.refreshToken = (req, res) => {
  const refreshToken = req.body.refreshToken || req.headers["x-refresh-token"];

  if (!refreshToken) {
    return res.status(401).json({ message: "Refresh token required" });
  }

  if (!refreshTokens.includes(refreshToken)) {
    return res.status(403).json({ message: "Invalid refresh token" });
  }

  jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ message: "Token expired or invalid" });
    }

    const newAccessToken = jwt.sign(
      { id: decoded.id, username: decoded.username },
      process.env.ACCESS_TOKEN_SECRET,
      { expiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN || "15m" }
    );

    res.status(200).json({ accessToken: newAccessToken });
  });
};

// 🚪 Logout
exports.logout = (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(400).json({ message: "Refresh token missing" });
  }

  refreshTokens = refreshTokens.filter((token) => token !== refreshToken);
  res.status(200).json({ message: "Logged out successfully" });
};
