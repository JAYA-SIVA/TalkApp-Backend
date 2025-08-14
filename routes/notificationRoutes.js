// routes/notificationRoutes.js
const express = require("express");
const router = express.Router();

// ✅ Auth middleware (keep naming consistent across app)
const auth = require("../middleware/auth");

// ✅ Controller actions
const {
  createNotification,
  getMyNotifications,
  getUnreadCount,
  markRead,
  markAllRead,
  remove,
} = require("../controllers/notificationController");

/* ─────────────────────────────────────────
   NOTIFICATION ROUTES (mounted at /api/notifications)
   ───────────────────────────────────────── */

/**
 * POST /api/notifications
 * Body: { userId, fromUserId?, type, postId?, message?, meta? }
 * Creates a notification and emits via Socket.IO.
 */
router.post("/", auth, createNotification);

/**
 * GET /api/notifications?page=&limit=
 * Returns current user's notifications (uses req.user.id).
 */
router.get("/", auth, getMyNotifications);

/**
 * GET /api/notifications/unread-count
 * Returns { unreadCount } for the current user.
 */
router.get("/unread-count", auth, getUnreadCount);

/**
 * PUT /api/notifications/read/:id
 * Marks a single notification as read (if it belongs to the current user).
 */
router.put("/read/:id", auth, markRead);

/**
 * PUT /api/notifications/read-all
 * Marks all notifications as read for the current user.
 */
router.put("/read-all", auth, markAllRead);

/**
 * DELETE /api/notifications/:id
 * Deletes one notification (only if it belongs to current user).
 */
router.delete("/:id", auth, remove);

module.exports = router;
