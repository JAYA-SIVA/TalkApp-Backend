// routes/bookmarkRoutes.js

const express = require("express");
const router = express.Router();

const {
  toggleBookmark,
  getUserBookmarks,
} = require("../controllers/bookmarkController");

const auth = require("../middleware/auth"); // 🔐 JWT Authentication Middleware

// ✅ Toggle bookmark (Add/Remove) — Uses JWT to get userId
// Endpoint: PUT /api/bookmarks/toggle
router.put("/toggle", auth, toggleBookmark);

// ✅ Get all bookmarks for logged-in user — Uses JWT to get userId
// Endpoint: GET /api/bookmarks
router.get("/", auth, getUserBookmarks);

module.exports = router;
