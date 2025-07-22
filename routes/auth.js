// routes/auth.js

const express = require("express");
const router = express.Router();

// ✅ Controllers
const {
  registerUser,
  loginUser,
} = require("../controllers/authController");

// ─────────────────────────────────────────────
// ✅ Register New User
// Method: POST
// Route: /api/auth/register
// Body: { username, email, password }
// ─────────────────────────────────────────────
router.post("/register", registerUser);

// ─────────────────────────────────────────────
// ✅ Login User
// Method: POST
// Route: /api/auth/login
// Body: { email, password }
// ─────────────────────────────────────────────
router.post("/login", loginUser);

module.exports = router;
