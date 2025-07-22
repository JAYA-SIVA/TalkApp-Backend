const express = require("express");
const router = express.Router();

// ✅ Controllers
const {
  createNotification,
  getNotifications,
  markAsSeen,
} = require("../controllers/notificationController");

// ✅ JWT Auth Middleware
const auth = require("../middleware/auth");

// ─────────────────────────────────────────────
// 📤 Create a New Notification
// Method: POST
// Route: /api/notifications
// Access: Protected
// Body: { userId, fromUserId, postId?, type, message? }
// ─────────────────────────────────────────────
router.post("/", auth, createNotification);

// ─────────────────────────────────────────────
// 📥 Get All Notifications for a User
// Method: GET
// Route: /api/notifications/:userId
// Access: Protected
// ─────────────────────────────────────────────
router.get("/:userId", auth, getNotifications);

// ─────────────────────────────────────────────
// ✅ Mark All Notifications as Seen
// Method: PUT
// Route: /api/notifications/mark-read/:userId
// Access: Protected
// ─────────────────────────────────────────────
router.put("/mark-read/:userId", auth, markAsSeen);

module.exports = router;
