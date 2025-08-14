// utils/createNotification.js
// Shared helper to persist a notification AND emit a Socket.IO event to the recipient.
// Requires: app sets `global.io = io` (already done in app.js)

const Notification = require("../models/Notification");

/**
 * Create & emit a notification.
 * Usage:
 *   await createNotification({
 *     userId,         // recipient (ObjectId|string)
 *     fromUserId,     // actor     (ObjectId|string)
 *     type,           // 'follow' | 'follow_request' | 'like' | 'unlike' | 'comment' | 'message' | 'post_upload'
 *     postId,         // optional related Post/Reel id
 *     message,        // optional human text
 *     meta,           // optional extra info object
 *   })
 *
 * Returns the created document or null if skipped/failed.
 */
module.exports = async function createNotification(opts = {}) {
  try {
    const {
      userId,
      fromUserId,
      type,
      postId = null,
      message = "",
      meta = {},
    } = opts;

    // Basic guards
    if (!userId || !fromUserId || !type) return null;
    if (String(userId) === String(fromUserId)) return null; // skip self-notifications

    // Persist
    const doc =
      Notification && typeof Notification.pushNotification === "function"
        ? await Notification.pushNotification({ userId, fromUserId, type, postId, message, meta })
        : await Notification.create({ userId, fromUserId, type, postId, message, meta, seen: false });

    // Realtime emit (safe no-op if io not present)
    try {
      if (global.io) {
        global.io.to(String(userId)).emit("notification:new", {
          _id: doc._id,
          userId: String(userId),
          fromUserId: String(fromUserId),
          type,
          postId: postId ? String(postId) : null,
          message,
          meta,
          seen: false,
          createdAt: doc.createdAt,
        });
      }
    } catch (e) {
      // don't fail the request because of a socket issue
      console.warn("[createNotification] socket emit failed:", e.message);
    }

    return doc;
  } catch (err) {
    console.error("[createNotification] error:", err.message);
    return null;
  }
};
