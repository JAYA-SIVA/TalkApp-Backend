// models/Notification.js
const mongoose = require("mongoose");

const NOTIFICATION_TYPES = [
  "follow",          // someone followed you
  "follow_request",  // someone requested to follow (private account)
  "like",
  "unlike",
  "comment",
  "message",         // direct message
  "post_upload",     // new: user uploaded a new post
];

const { Schema } = mongoose;

const notificationSchema = new Schema(
  {
    // receiver
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // actor (who did the action)
    fromUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // event type
    type: {
      type: String,
      enum: NOTIFICATION_TYPES,
      required: true,
      index: true,
    },

    // related post for like/comment (nullable)
    // (You currently store reel _id here too — that's okay; just avoid hardcoded populate)
    postId: {
      type: Schema.Types.ObjectId,
      ref: "Post",
      default: null,
      index: true,
    },

    // optional extra info (future-proof container)
    // e.g. { commentText: "...", reelId: "...", preview: "..." }
    meta: {
      type: Object,
      default: {},
    },

    // optional human text (can also be built on client)
    message: {
      type: String,
      default: "",
      trim: true,
    },

    // read state
    seen: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

/* ------------------------------- Indexes ------------------------------- */
// Optimized listing for a recipient's inbox
notificationSchema.index({ userId: 1, seen: 1, createdAt: -1 });
// Useful when showing "recent activity you did"
notificationSchema.index({ fromUserId: 1, createdAt: -1 });
// Sometimes handy to filter by type for the user
notificationSchema.index({ userId: 1, type: 1, createdAt: -1 });

/* ------------------------------ Virtuals ------------------------------ */
// Convenient virtuals for populate (optional)
notificationSchema.virtual("user", {
  ref: "User",
  localField: "userId",
  foreignField: "_id",
  justOne: true,
});
notificationSchema.virtual("actor", {
  ref: "User",
  localField: "fromUserId",
  foreignField: "_id",
  justOne: true,
});
notificationSchema.virtual("post", {
  ref: "Post",
  localField: "postId",
  foreignField: "_id",
  justOne: true,
});

/* --------------------------- Static Helpers --------------------------- */
/**
 * Create a notification safely.
 * Skips if missing ids or actor === recipient.
 */
notificationSchema.statics.pushNotification = async function ({
  userId,
  fromUserId,
  type,
  postId = null,
  message = "",
  meta = {},
}) {
  if (!userId || !fromUserId || !type) return null;
  if (userId.toString() === fromUserId.toString()) return null; // prevent self-notify
  return this.create({ userId, fromUserId, type, postId, message, meta });
};

/**
 * List notifications for a user with simple pagination.
 * opts: { seen, type, limit=20, skip=0, populate=false }
 */
notificationSchema.statics.listForUser = function (userId, opts = {}) {
  const {
    seen,
    type,
    limit = 20,
    skip = 0,
    populate = false,
  } = opts;

  const query = { userId };
  if (typeof seen === "boolean") query.seen = seen;
  if (type) query.type = type;

  let q = this.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(Math.min(Number(limit) || 20, 100));

  if (populate) {
    q = q.populate("actor", "_id username profilePic");
    // NOTE: Do not hardcode populate("postId") here because sometimes this holds a reel _id.
    // If needed, populate target in the caller based on your own type/logic.
  }

  return q;
};

/**
 * Mark a set of notifications as seen for a user.
 * ids can be an array of ObjectIds/strings.
 */
notificationSchema.statics.markSeen = function (userId, ids = []) {
  if (!Array.isArray(ids) || !ids.length) {
    return Promise.resolve({ acknowledged: true, modifiedCount: 0 });
  }
  return this.updateMany(
    { userId, _id: { $in: ids } },
    { $set: { seen: true } }
  );
};

/**
 * Mark all notifications as seen for a user.
 */
notificationSchema.statics.markAllSeenForUser = function (userId) {
  return this.updateMany({ userId, seen: false }, { $set: { seen: true } });
};

/**
 * Delete notifications for a user (optionally by type / olderThan).
 * opts: { type, olderThan: Date }
 */
notificationSchema.statics.clearForUser = function (userId, opts = {}) {
  const { type, olderThan } = opts;
  const query = { userId };
  if (type) query.type = type;
  if (olderThan instanceof Date) query.createdAt = { $lt: olderThan };
  return this.deleteMany(query);
};

/* -------------------------- Instance Helper -------------------------- */
notificationSchema.methods.markAsSeen = function () {
  this.seen = true;
  return this.save();
};

/* --------------------------- Model & Exports -------------------------- */
const Notification =
  mongoose.models.Notification ||
  mongoose.model("Notification", notificationSchema);

module.exports = Notification;
module.exports.NOTIFICATION_TYPES = NOTIFICATION_TYPES;
