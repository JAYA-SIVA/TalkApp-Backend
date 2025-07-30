const express = require("express");
const router = express.Router();

// ✅ Controllers
const {
  registerUser,
  loginUser,
  refreshToken,  // 🔁 New: To refresh access token
  logout         // 🔓 New: To log out
} = require("../controllers/authController");

// ✅ Register
router.post("/register", registerUser);

// ✅ Login
router.post("/login", loginUser);

// 🔁 Refresh Access Token
router.post("/refresh", refreshToken);

// 🔓 Logout
router.post("/logout", logout);

module.exports = router;
