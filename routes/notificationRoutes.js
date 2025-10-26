// routes/notificationRoutes.js
const express = require("express");
const router = express.Router();
const { body, param, query } = require("express-validator");

// ✅ Auth
const auth = require("../middleware/authMiddleware");

// ✅ Controllers
const {
  createNotification,
  getMyNotifications,
  getUnreadCount,
  markRead,
  markAllRead,
  remove,
} = require("../controllers/notificationController");

// ✅ Small helper: centralized validation error handling
const { validationResult } = require("express-validator");
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: "Validation failed", errors: errors.array() });
  }
  next();
};

/**
 * ⚠️ POST /api/notifications
 * Body: { userId, fromUserId?, type, postId?, message?, meta? }
 * TIP: Prefer server-side creation (like/follow/comment controllers).
 * If you keep this route, restrict it (e.g., internal API key / admin).
 */
router.post(
  "/",
  auth,
  body("userId").isMongoId().withMessage("userId is required"),
  body("type").isString().isIn(["LIKE_POST", "COMMENT_POST", "FOLLOW_USER", "REPLY", "MENTION"])
    .withMessage("Invalid type"),
  body("fromUserId").optional().isMongoId(),
  body("postId").optional().isMongoId(),
  body("message").optional().isString().isLength({ max: 300 }),
  validate,
  createNotification
);

/**
 * GET /api/notifications?page=&limit=
 * List current user's notifications.
 */
router.get(
  "/",
  auth,
  query("page").optional().isInt({ min: 1 }).toInt(),
  query("limit").optional().isInt({ min: 1, max: 100 }).toInt(),
  validate,
  getMyNotifications
);

/**
 * GET /api/notifications/unread-count
 * Get unread notifications count.
 */
router.get("/unread-count", auth, getUnreadCount);

/**
 * PUT /api/notifications/read/:id
 * Mark a single notification as read.
 */
router.put(
  "/read/:id",
  auth,
  param("id").isMongoId().withMessage("Invalid notification id"),
  validate,
  markRead
);

/**
 * PUT /api/notifications/read-all
 * Mark all notifications as read.
 */
router.put("/read-all", auth, markAllRead);

/**
 * DELETE /api/notifications/:id
 * Delete a notification.
 */
router.delete(
  "/:id",
  auth,
  param("id").isMongoId().withMessage("Invalid notification id"),
  validate,
  remove
);

// (Optional) if your infra sends preflights to specific paths
router.options("*", (_req, res) => res.sendStatus(204));

module.exports = router;
