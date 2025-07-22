const mongoose = require("mongoose");
const Notification = require("../models/Notification");

// ✅ Validate ObjectId
const ObjectId = mongoose.Types.ObjectId;

// ─────────────────────────────────────────────
// 📤 Create a New Notification
// Route: POST /api/notifications
// Protected: YES
// ─────────────────────────────────────────────
exports.createNotification = async (req, res) => {
  try {
    const { userId, fromUserId, postId, type, message } = req.body;

    console.log("📥 CreateNotification Request:", { userId, fromUserId, postId, type });

    // ✅ Validate required fields
    if (!userId || !fromUserId || !type) {
      return res.status(400).json({ message: "Missing required fields: userId, fromUserId, or type" });
    }

    // ✅ Validate IDs
    if (!ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Invalid userId" });
    }
    if (!ObjectId.isValid(fromUserId)) {
      return res.status(400).json({ message: "Invalid fromUserId" });
    }

    // ✅ Prepare Notification Payload
    const notificationData = {
      userId: new ObjectId(userId),
      fromUserId: new ObjectId(fromUserId),
      type,
      message: message || "",
      seen: false,
    };

    if (postId && ObjectId.isValid(postId)) {
      notificationData.postId = new ObjectId(postId);
    }

    // ✅ Create Notification
    const notification = await Notification.create(notificationData);
    return res.status(201).json(notification);

  } catch (err) {
    console.error("❌ Notification creation failed:", err);
    res.status(500).json({ message: "Server Error", error: err.message });
  }
};

// ─────────────────────────────────────────────
// 📥 Get All Notifications for a User
// Route: GET /api/notifications/:userId
// Protected: YES
// ─────────────────────────────────────────────
exports.getNotifications = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }

    const notifications = await Notification.find({ userId: new ObjectId(userId) })
      .sort({ createdAt: -1 })
      .populate("fromUserId", "username profilePic")
      .populate("postId", "caption images");

    res.status(200).json(notifications);
  } catch (err) {
    console.error("❌ Fetching notifications failed:", err);
    res.status(500).json({ message: "Server Error", error: err.message });
  }
};

// ─────────────────────────────────────────────
// ✅ Mark All Notifications as Seen
// Route: PUT /api/notifications/mark-read/:userId
// Protected: YES
// ─────────────────────────────────────────────
exports.markAsSeen = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }

    const result = await Notification.updateMany(
      { userId: new ObjectId(userId), seen: false },
      { $set: { seen: true } }
    );

    return res.status(200).json({
      message: `${result.modifiedCount} notifications marked as seen.`,
    });

  } catch (err) {
    console.error("❌ Marking notifications as seen failed:", err);
    res.status(500).json({ message: "Server Error", error: err.message });
  }
};
