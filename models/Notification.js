// models/Notification.js
const mongoose = require("mongoose");

const NOTIFICATION_TYPES = [
  "follow",
  "follow_request",
  "like",
  "unlike",
  "comment",
  "message",
  "post_upload",
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

    // 🔁 Polymorphic relation: Post or Reel (optional but recommended)
    // If you ONLY ever reference Post, you can delete postRef and set `ref:"Post"` directly.
    postRef: {
      type: String,
      enum: ["Post", "Reel"],
      default: "Post",
    },
    postId: {
      type: Schema.Types.ObjectId,
      refPath: "postRef",
      default: null,
      index: true,
    },

    // optional extra info (future-proof container)
    meta: {
      type: Object,
      default: {},
    },

    // optional human text (server or client can render)
    message: {
      type: String,
      default: "",
      trim: true,
      maxlength: 300,
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
    versionKey: false, // 👈 cleaner payloads
  }
);

/* ------------------------------- Indexes ------------------------------- */
// Optimized listing for a recipient's inbox (sort stable by createdAt/_id)
notificationSchema.index({ userId: 1, createdAt: -1, _id: -1 });
notificationSchema.index({ userId: 1, seen: 1, createdAt: -1 });
// Useful when showing "recent activity you did"
notificationSchema.index({ fromUserId: 1, createdAt: -1 });
// Sometimes handy to filter by type for the user
notificationSchema.index({ userId: 1, type: 1, createdAt: -1 });

/* ------------------------------ Virtuals ------------------------------ */
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
  ref: (doc) => doc.postRef, // 👈 respects Post/Reel
  localField: "postId",
  foreignField: "_id",
  justOne: true,
});

/* --------------------------- Static Helpers --------------------------- */
/**
 * Create a notification safely.
 * Skips if missing ids or actor === recipient.
 * Optional collapse window to prevent spam duplicates (e.g., repeated likes in 30s).
 */
notificationSchema.statics.pushNotification = async function ({
  userId,
  fromUserId,
  type,
  postId = null,
  postRef = "Post",
  message = "",
  meta = {},
  collapseWindowSec = 0, // e.g., 30 to collapse duplicates within 30s
}) {
  if (!userId || !fromUserId || !type) return null;
  if (userId.toString() === fromUserId.toString()) return null; // prevent self-notify

  if (collapseWindowSec > 0) {
    const since = new Date(Date.now() - collapseWindowSec * 1000);
    const dup = await this.findOne({
      userId,
      fromUserId,
      type,
      postId: postId || null,
      createdAt: { $gte: since },
    }).select("_id");
    if (dup) return dup; // return existing
  }

  return this.create({ userId, fromUserId, type, postId, postRef, message, meta });
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
    .select("_id type message seen createdAt fromUserId postId postRef meta")
    .sort({ createdAt: -1, _id: -1 })
    .skip(skip)
    .limit(Math.min(Number(limit) || 20, 100));

  if (populate) {
    q = q
      .populate("actor", "_id username profilePic")
      .populate("post", "_id images video caption type thumbnail");
  }

  return q;
};

/**
 * Count unread for a user.
 */
notificationSchema.statics.unreadCountForUser = function (userId) {
  return this.countDocuments({ userId, seen: false });
};

/**
 * Mark a set of notifications as seen for a user.
 * ids can be an array of ObjectIds/strings.
 */
notificationSchema.statics.markSeen = function (userId, ids = []) {
  if (!Array.isArray(ids) || !ids.length) {
    return Promise.resolve({ acknowledged: true, modifiedCount: 0 });
  }
  return this.updateMany({ userId, _id: { $in: ids } }, { $set: { seen: true } });
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
