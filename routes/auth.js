// routes/auth.js
const express = require("express");
const router = express.Router();

// Controllers
const {
  registerUser,
  loginUser,
  refreshToken,
  logout,
} = require("../controllers/authController");

// POST /api/auth/register
router.post("/register", registerUser);

// POST /api/auth/login
router.post("/login", loginUser);

// POST /api/auth/refresh
router.post("/refresh", refreshToken);

// POST /api/auth/logout
router.post("/logout", logout);

module.exports = router;
