// routes/notificationRoutes.js
const express = require("express");
const router = express.Router();

// Auth middleware (same one you use for user routes)
const protect = require("../middleware/authMiddleware");

// Controller actions
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
 * Creates a notification.
 */
router.post("/", protect, createNotification);

/**
 * GET /api/notifications?page=&limit=
 * Returns current user's notifications (uses req.user.id).
 */
router.get("/", protect, getMyNotifications);

/**
 * GET /api/notifications/unread-count
 * Returns { unreadCount } for the current user.
 */
router.get("/unread-count", protect, getUnreadCount);

/**
 * PUT /api/notifications/read/:id
 * Marks a single notification as read (only if it belongs to current user).
 */
router.put("/read/:id", protect, markRead);

/**
 * PUT /api/notifications/read-all
 * Marks all notifications as read for current user.
 */
router.put("/read-all", protect, markAllRead);

/**
 * DELETE /api/notifications/:id
 * Deletes one notification (only if it belongs to current user).
 */
router.delete("/:id", protect, remove);

module.exports = router;
