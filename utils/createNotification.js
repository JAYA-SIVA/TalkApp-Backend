// utils/createNotification.js
// Shared helper to persist notifications using your Notification model.
// Works with your schema fields: userId, fromUserId, type, postId, message, meta, seen.

const Notification = require("../models/Notification");

/**
 * Create a notification.
 * Usage:
 *   await createNotification({
 *     userId,         // recipient (ObjectId or string)
 *     fromUserId,     // actor     (ObjectId or string)
 *     type,           // 'follow' | 'follow_request' | 'like' | 'unlike' | 'comment' | 'message'
 *     postId,         // optional related Post id
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

    // If you kept the static helper on the model, prefer it.
    if (Notification && typeof Notification.pushNotification === "function") {
      return await Notification.pushNotification({
        userId,
        fromUserId,
        type,
        postId,
        message,
        meta,
      });
    }

    // Fallback: direct create
    if (!Notification) return null;
    return await Notification.create({
      userId,
      fromUserId,
      type,
      postId,
      message,
      meta,
    });
  } catch (err) {
    console.error("[createNotification] error:", err.message);
    return null;
  }
};
