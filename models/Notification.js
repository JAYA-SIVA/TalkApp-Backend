const mongoose = require("mongoose");

const NOTIFICATION_TYPES = [
  "follow",          // someone followed you
  "follow_request",  // someone requested to follow (private account)
  "like",
  "unlike",
  "comment",
  "message"          // direct message
];

const notificationSchema = new mongoose.Schema(
  {
    // receiver
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // actor (who did the action)
    fromUserId: {
      type: mongoose.Schema.Types.ObjectId,
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
    postId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Post",
      default: null,
      index: true,
    },

    // optional extra info (safe place for future-proof data)
    meta: {
      // e.g. { commentText: "...", reelId: "...", preview: "..." }
      type: Object,
      default: {},
    },

    // human text (optional; you can also build it on the client)
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

// 🔎 Compound index for list screen performance (by newest first)
notificationSchema.index({ userId: 1, seen: 1, createdAt: -1 });

// 🚫 Don’t store self-notifications (actor == receiver)
notificationSchema.pre("save", function (next) {
  if (this.userId?.toString() === this.fromUserId?.toString()) {
    const err = new Error("Self notification prevented");
    // silently skip by calling next(err) would throw; instead just stop save:
    return next(err);
  }
  next();
});

// Small helper for consistent creation
notificationSchema.statics.pushNotification = async function ({
  userId,
  fromUserId,
  type,
  postId = null,
  message = "",
  meta = {},
}) {
  if (!userId || !fromUserId || userId.toString() === fromUserId.toString()) return null;
  return this.create({ userId, fromUserId, type, postId, message, meta });
};

module.exports = mongoose.model("Notification", notificationSchema);
module.exports.NOTIFICATION_TYPES = NOTIFICATION_TYPES;
