// controllers/notificationController.js
const mongoose = require("mongoose");
const Notification = require("../models/Notification");
const createNotificationHelper = require("../utils/createNotification"); // emits + saves

const { Types } = mongoose;
const isValidId = (id) => Types.ObjectId.isValid(id);

// Keep in sync with models/Notification.js
const ALLOWED_TYPES = new Set([
  "follow",
  "follow_request",
  "like",
  "unlike",
  "comment",
  "message",
  "post_upload", // ✅ new
]);

/* ------------------------------ helpers ------------------------------ */
function buildAutoMessage(type, actorUsername) {
  switch (type) {
    case "follow":
      return `${actorUsername} started following you`;
    case "follow_request":
      return `${actorUsername} requested to follow you`;
    case "like":
      return `${actorUsername} liked your post`;
    case "unlike":
      return `${actorUsername} unliked your post`;
    case "comment":
      return `${actorUsername} commented on your post`;
    case "message":
      return `${actorUsername} sent you a message`;
    case "post_upload":
      return `${actorUsername} posted a new update`;
    default:
      return "";
  }
}

/* ---------------------------- create (POST) --------------------------- */
/**
 * Body: { userId, fromUserId?, type, postId?, message?, meta? }
 * - userId: receiver (required)
 * - fromUserId: actor; defaults to req.user.id
 * Uses the shared helper so it also emits over Socket.IO.
 */
exports.createNotification = async (req, res) => {
  try {
    const {
      userId,
      fromUserId: fromRaw,
      type,
      postId,
      message,
      meta = {},
    } = req.body;

    const actorId = fromRaw || (req.user && (req.user.id || req.user._id));

    if (!userId || !actorId || !type) {
      return res
        .status(400)
        .json({ message: "userId, fromUserId (or session), and type are required" });
    }
    if (!isValidId(userId)) return res.status(400).json({ message: "Invalid userId" });
    if (!isValidId(actorId)) return res.status(400).json({ message: "Invalid fromUserId" });
    if (!ALLOWED_TYPES.has(type)) return res.status(400).json({ message: "Invalid type" });
    if (String(userId) === String(actorId)) {
      return res.status(400).json({ message: "Cannot notify yourself" });
    }

    if (postId && !isValidId(postId)) {
      return res.status(400).json({ message: "Invalid postId" });
    }

    const finalMessage =
      typeof message === "string" && message.trim()
        ? message.trim()
        : buildAutoMessage(type, req.user?.username || "Someone");

    const doc = await createNotificationHelper({
      userId,
      fromUserId: actorId,
      type,
      postId: postId || null,
      message: finalMessage,
      meta,
    });

    return res.status(201).json(doc);
  } catch (err) {
    console.error("createNotification error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

/* ----------------------------- list (GET) ----------------------------- */
/**
 * Query: ?page=1&limit=30
 * Returns: { items, page, limit, total, unreadCount, hasMore }
 */
exports.getMyNotifications = async (req, res) => {
  try {
    const me = req.user.id || req.user._id;
    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || "30", 10), 1), 100);
    const skip = (page - 1) * limit;

    const [items, total, unreadCount] = await Promise.all([
      Notification.find({ userId: me })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("fromUserId", "username profilePic") // actor
        // note: postId may hold a Reel id in some flows; populate will simply be null if not a Post
        .populate("postId", "_id images video caption type")
        .lean(),
      Notification.countDocuments({ userId: me }),
      Notification.countDocuments({ userId: me, seen: false }),
    ]);

    res.json({
      items,
      page,
      limit,
      total,
      unreadCount,
      hasMore: skip + items.length < total,
    });
  } catch (err) {
    console.error("getMyNotifications error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

/* ----------------------- unread count (GET) --------------------------- */
exports.getUnreadCount = async (req, res) => {
  try {
    const me = req.user.id || req.user._id;
    const unreadCount = await Notification.countDocuments({ userId: me, seen: false });
    res.json({ unreadCount });
  } catch (err) {
    console.error("getUnreadCount error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

/* ---------------------- mark ONE read (PUT) --------------------------- */
exports.markRead = async (req, res) => {
  try {
    const me = req.user.id || req.user._id;
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ message: "Invalid notification id" });

    const updated = await Notification.findOneAndUpdate(
      { _id: id, userId: me },
      { $set: { seen: true } },
      { new: true }
    );

    if (!updated) return res.status(404).json({ message: "Notification not found" });
    res.json({ success: true });
  } catch (err) {
    console.error("markRead error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

/* -------------------- mark ALL read (PUT) ----------------------------- */
exports.markAllRead = async (req, res) => {
  try {
    const me = req.user.id || req.user._id;
    const result = await Notification.updateMany(
      { userId: me, seen: false },
      { $set: { seen: true } }
    );
    res.json({ success: true, modified: result.modifiedCount || 0 });
  } catch (err) {
    console.error("markAllRead error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

/* --------------------------- delete (DELETE) -------------------------- */
exports.remove = async (req, res) => {
  try {
    const me = req.user.id || req.user._id;
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ message: "Invalid notification id" });

    const { deletedCount } = await Notification.deleteOne({ _id: id, userId: me });
    if (!deletedCount) return res.status(404).json({ message: "Notification not found" });

    res.json({ success: true });
  } catch (err) {
    console.error("delete notification error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};
