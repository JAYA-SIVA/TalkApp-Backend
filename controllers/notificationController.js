// controllers/notificationController.js
const mongoose = require("mongoose");
const Notification = require("../models/Notification");
const createNotificationHelper = require("../utils/createNotification");

const { Types } = mongoose;
const isValidId = (id) => Types.ObjectId.isValid(id);

// ⚠️ Keep this in sync with your Notification schema enum
const ALLOWED_TYPES = new Set([
  "follow",
  "follow_request",
  "like",
  "unlike",
  "comment",
  "message",
  "post_upload",
]);

/* -------------------------------- helpers ------------------------------- */
function buildAutoMessage(type, actorUsername) {
  const u = actorUsername || "Someone";
  switch (type) {
    case "follow": return `${u} started following you`;
    case "follow_request": return `${u} requested to follow you`;
    case "like": return `${u} liked your post`;
    case "unlike": return `${u} unliked your post`;
    case "comment": return `${u} commented on your post`;
    case "message": return `${u} sent you a message`;
    case "post_upload": return `${u} posted a new update`;
    default: return "";
  }
}

// lazy import to avoid circulars when auth attaches req.user
async function getUsernameOrFallback(userId, fallback = "Someone") {
  try {
    const User = require("../models/User");
    const doc = await User.findById(userId).select("username").lean();
    return doc?.username || fallback;
  } catch {
    return fallback;
  }
}

/* ---------------------------- create (POST) ---------------------------- */
/**
 * Body: { userId, fromUserId?, type, postId?, message?, meta? }
 * - userId: receiver (required)
 * - fromUserId: actor; defaults to session user
 * NOTE: This route should be treated as internal. Ideally, create notifications
 *       inside like/follow/comment controllers and call the helper directly.
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
      return res.status(400).json({ message: "userId, fromUserId (or session), and type are required" });
    }
    if (!isValidId(userId)) return res.status(400).json({ message: "Invalid userId" });
    if (!isValidId(actorId)) return res.status(400).json({ message: "Invalid fromUserId" });
    if (!ALLOWED_TYPES.has(String(type))) return res.status(400).json({ message: "Invalid type" });
    if (String(userId) === String(actorId)) {
      return res.status(400).json({ message: "Cannot notify yourself" });
    }
    if (postId && !isValidId(postId)) {
      return res.status(400).json({ message: "Invalid postId" });
    }

    let finalMessage = (typeof message === "string" ? message.trim() : "");
    if (!finalMessage) {
      // Prefer req.user.username, otherwise fetch actor username
      const actorName = req.user?.username || await getUsernameOrFallback(actorId, "Someone");
      finalMessage = buildAutoMessage(String(type), actorName);
    }
    if (finalMessage.length > 300) finalMessage = finalMessage.slice(0, 300);

    const doc = await createNotificationHelper({
      userId,
      fromUserId: actorId,
      type: String(type),
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
    const page = Number.isFinite(+req.query.page) ? Math.max(parseInt(req.query.page, 10), 1) : 1;
    const limitRaw = Number.isFinite(+req.query.limit) ? parseInt(req.query.limit, 10) : 30;
    const limit = Math.min(Math.max(limitRaw, 1), 100);
    const skip = (page - 1) * limit;

    const [items, total, unreadCount] = await Promise.all([
      Notification.find({ userId: me })
        .select("_id type message seen createdAt fromUserId postId meta") // projection
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        // Virtual 'actor' must be defined in the model
        .populate("actor", "username profilePic")
        // If postId can be Post or Reel via refPath, model should define it.
        // Otherwise this will populate only when it is a Post.
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

/* ----------------------- unread count (GET) -------------------------- */
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

/* ---------------------- mark ONE read (PUT) -------------------------- */
exports.markRead = async (req, res) => {
  try {
    const me = req.user.id || req.user._id;
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ message: "Invalid notification id" });

    const updated = await Notification.findOneAndUpdate(
      { _id: id, userId: me },
      { $set: { seen: true } },
      { new: false }
    ).select("_id");

    if (!updated) return res.status(404).json({ message: "Notification not found" });
    // Optional: emit socket event to update badge on other devices
    // req.app.get("io")?.to(String(me)).emit("notifications:read", { ids: [id] });

    res.json({ success: true });
  } catch (err) {
    console.error("markRead error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

/* -------------------- mark ALL read (PUT) ---------------------------- */
exports.markAllRead = async (req, res) => {
  try {
    const me = req.user.id || req.user._id;
    const result = await Notification.updateMany(
      { userId: me, seen: false },
      { $set: { seen: true } }
    );
    // Optional: emit socket event to zero the badge
    // req.app.get("io")?.to(String(me)).emit("notifications:readAll");
    res.json({ success: true, modified: result.modifiedCount || 0 });
  } catch (err) {
    console.error("markAllRead error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

/* --------------------------- delete (DELETE) ------------------------- */
exports.remove = async (req, res) => {
  try {
    const me = req.user.id || req.user._id;
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ message: "Invalid notification id" });

    const { deletedCount } = await Notification.deleteOne({ _id: id, userId: me });
    if (!deletedCount) return res.status(404).json({ message: "Notification not found" });

    // Optional: emit socket event to remove from list in realtime
    // req.app.get("io")?.to(String(me)).emit("notifications:removed", { id });

    res.json({ success: true });
  } catch (err) {
    console.error("delete notification error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};
