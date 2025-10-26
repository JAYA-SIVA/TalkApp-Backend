// utils/createNotification.js
// Shared helper: persist a notification + emit Socket.IO (+ optional FCM).
// Requires: global.io set in app.js (already done).

const Notification = require("../models/Notification");

// OPTIONAL: uncomment if you want push notifications (FCM)
// const admin = require("../utils/fcm");

/**
 * Create & emit a notification.
 * @param {Object} opts
 * @param {string|ObjectId} opts.userId       - recipient
 * @param {string|ObjectId} opts.fromUserId   - actor
 * @param {("follow"|"follow_request"|"like"|"unlike"|"comment"|"message"|"post_upload")} opts.type
 * @param {string|ObjectId} [opts.postId]     - related Post/Reel id
 * @param {("Post"|"Reel")} [opts.postRef="Post"] - polymorphic ref (matches model refPath)
 * @param {string} [opts.message]             - human text (<= 300 chars)
 * @param {Object} [opts.meta]                - extra payload
 * @param {number} [opts.collapseWindowSec=0] - de-duplicate within N seconds (e.g. 30)
 * @param {boolean} [opts.push=false]         - send FCM push too (requires utils/fcm)
 * @returns {Promise<Object|null>}            - created or existing doc (when collapsed) or null
 */
module.exports = async function createNotification(opts = {}) {
  try {
    const {
      userId,
      fromUserId,
      type,
      postId = null,
      postRef = "Post",
      message = "",
      meta = {},
      collapseWindowSec = 0,
      push = false,
    } = opts;

    // Basic guards
    if (!userId || !fromUserId || !type) return null;
    if (String(userId) === String(fromUserId)) return null; // skip self-notifications

    // Trim/limit message
    let msg = typeof message === "string" ? message.trim() : "";
    if (msg.length > 300) msg = msg.slice(0, 300);

    // Persist (with optional duplicate collapse)
    const doc =
      Notification && typeof Notification.pushNotification === "function"
        ? await Notification.pushNotification({
            userId,
            fromUserId,
            type,
            postId,
            postRef,
            message: msg,
            meta,
            collapseWindowSec,
          })
        : await Notification.create({
            userId,
            fromUserId,
            type,
            postId,
            postRef,
            message: msg,
            meta,
            seen: false,
          });

    // --- Socket emit (safe no-op if io missing) ---
    try {
      if (global.io) {
        // emit the new notification
        global.io.to(String(userId)).emit("notification:new", {
          _id: String(doc._id),
          userId: String(userId),
          fromUserId: String(fromUserId),
          type,
          postId: postId ? String(postId) : null,
          postRef,
          message: doc.message || msg || "",
          meta,
          seen: !!doc.seen,
          createdAt: doc.createdAt,
        });

        // also update badge count for receiver
        const unreadCount = await Notification.unreadCountForUser?.(userId)
          ?? await Notification.countDocuments({ userId, seen: false });
        global.io.to(String(userId)).emit("notification:badge", { unreadCount });
      }
    } catch (e) {
      console.warn("[createNotification] socket emit failed:", e.message);
    }

    // --- Optional FCM push ---
    if (push /* && admin */) {
      try {
        // You need a user lookup to get target's fcmToken:
        // const User = require("../models/User");
        // const target = await User.findById(userId).select("fcmToken").lean();
        // if (target?.fcmToken) {
        //   await admin.messaging().send({
        //     token: target.fcmToken,
        //     notification: {
        //       title: type.replace("_", " ").toUpperCase(),
        //       body: doc.message || msg || "New notification",
        //     },
        //     data: {
        //       type,
        //       postId: postId ? String(postId) : "",
        //       fromUserId: String(fromUserId),
        //       notificationId: String(doc._id),
        //       postRef,
        //     },
        //   });
        // }
      } catch (e) {
        console.warn("[createNotification] FCM send failed:", e.message);
      }
    }

    return doc;
  } catch (err) {
    console.error("[createNotification] error:", err.message);
    return null;
  }
};
