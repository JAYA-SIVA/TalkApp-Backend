const express = require("express");
const router = express.Router();
const {
  createNotification,
  getNotifications,
  markAllAsRead,
} = require("../controllers/notifications");
const { ensureAuthenticated } = require("../middleware");

// ✅ Create a new notification
router.post("/", ensureAuthenticated, createNotification);

// ✅ Get all notifications for a user
router.get("/:userId", ensureAuthenticated, getNotifications);

// ✅ Mark all notifications as read for a user
router.put("/mark-read/:userId", ensureAuthenticated, markAllAsRead);

module.exports = router;
