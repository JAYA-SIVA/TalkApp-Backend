// routes/auth.js

const express = require("express");
const router = express.Router();

// ✅ Controllers
const {
  registerUser,
  loginUser,
  refreshToken,
  logout,
} = require("../controllers/authController");

// ─────────────────────────────────────────────
// ✅ Register New User
// POST /api/auth/register
// ─────────────────────────────────────────────
router.post("/register", registerUser);

// ─────────────────────────────────────────────
// ✅ Login User
// POST /api/auth/login
// ─────────────────────────────────────────────
router.post("/login", loginUser);

// ─────────────────────────────────────────────
// 🔁 Refresh Access Token using Refresh Token
// POST /api/auth/refresh-token
// Body: { token }
// ─────────────────────────────────────────────
router.post("/refresh-token", refreshToken);

// 🔓 Logout (invalidate refresh token)
// POST /api/auth/logout
// Body: { token }
// ─────────────────────────────────────────────
router.post("/logout", logout);

module.exports = router;
