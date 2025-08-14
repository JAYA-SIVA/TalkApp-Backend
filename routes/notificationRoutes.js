// routes/notificationRoutes.js
const express = require("express");
const router = express.Router();

// ✅ Use the correct auth middleware everywhere
const auth = require("../middleware/authMiddleware");

// Controllers
const {
  createNotification,
  getMyNotifications,
  getUnreadCount,
  markRead,
  markAllRead,
  remove,
} = require("../controllers/notificationController");

/**
 * POST /api/notifications
 * Body: { userId, fromUserId?, type, postId?, message?, meta? }
 * Create a notification (also emits via Socket.IO).
 */
router.post("/", auth, createNotification);

/**
 * GET /api/notifications?page=&limit=
 * List current user's notifications.
 */
router.get("/", auth, getMyNotifications);

/**
 * GET /api/notifications/unread-count
 * Get unread notifications count.
 */
router.get("/unread-count", auth, getUnreadCount);

/**
 * PUT /api/notifications/read/:id
 * Mark a single notification as read.
 */
router.put("/read/:id", auth, markRead);

/**
 * PUT /api/notifications/read-all
 * Mark all notifications as read.
 */
router.put("/read-all", auth, markAllRead);

/**
 * DELETE /api/notifications/:id
 * Delete a notification.
 */
router.delete("/:id", auth, remove);

module.exports = router;
