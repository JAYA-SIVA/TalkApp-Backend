// routes/admin.js

const express = require("express");
const router = express.Router();

// 📦 Import admin controller functions
const {
  getAllUsers,
  toggleBlockUser
} = require("../controllers/adminController");

// 🔐 JWT Auth Middleware
const auth = require("../middleware/auth");

// 🛡️ Admin Routes (secured with JWT)
router.get("/users", auth, getAllUsers);        // 📋 Get all users
router.put("/block/:id", auth, toggleBlockUser); // 🚫 Block / Unblock user

module.exports = router;
