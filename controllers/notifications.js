// backend/controllers/notifications.js
const Notification = require("../models/Notification");
const User = require("../models/User");

// Create a new notification
exports.createNotification = async (req, res) => {
  try {
    const { senderId, receiverId, type, postId } = req.body;

    const newNotification = await Notification.create({
      senderId,
      receiverId,
      type, // "like", "comment", "follow"
      postId,
    });

    res.status(201).json({ message: "Notification created", notification: newNotification });
  } catch (error) {
    res.status(500).json({ error: "Failed to create notification", details: error.message });
  }
};

// Get notifications for a user
exports.getNotifications = async (req, res) => {
  try {
    const { userId } = req.params;

    const notifications = await Notification.find({ receiverId: userId })
      .sort({ createdAt: -1 })
      .limit(20)
      .populate("senderId", "username profilePic")
      .populate("postId", "_id caption mediaUrl");

    res.status(200).json(notifications);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch notifications", details: error.message });
  }
};

// Mark all notifications as read
exports.markAllAsRead = async (req, res) => {
  try {
    const { userId } = req.params;

    await Notification.updateMany({ receiverId: userId, isRead: false }, { isRead: true });

    res.status(200).json({ message: "All notifications marked as read" });
  } catch (error) {
    res.status(500).json({ error: "Failed to mark notifications", details: error.message });
  }
};
