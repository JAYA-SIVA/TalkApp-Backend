const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    // 👤 User who will receive the notification
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // 👤 User who triggered the notification
    fromUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // 📌 Notification type
    type: {
      type: String,
      enum: ["like", "comment", "follow", "message"],
      required: true,
    },

    // 📷 Optional: Related post (for like/comment)
    postId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Post",
      default: null,
    },

    // ✉️ Custom message (optional)
    message: {
      type: String,
      default: "",
      trim: true,
    },

    // 👁️ Seen or not
    seen: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,                // Adds createdAt and updatedAt
    toJSON: { virtuals: true },      // Include virtuals in JSON output
    toObject: { virtuals: true },    // Include virtuals in object output
  }
);

// ✅ Indexing for performance
notificationSchema.index({ userId: 1, seen: 1, createdAt: -1 });

// ✅ Optional: Autopopulate plugin for testing (enable if needed)
// const autopopulate = require('mongoose-autopopulate');
// notificationSchema.plugin(autopopulate);

module.exports = mongoose.model("Notification", notificationSchema);
