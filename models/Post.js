// models/Post.js
const mongoose = require("mongoose");
const { Schema } = mongoose;

const commentSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    comment: { type: String, required: true, trim: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const postSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    type: {
      type: String,
      enum: ["post", "tweet", "reel", "story"],
      default: "post",
      index: true,
    },

    // text body (for tweets or plain text posts)
    text: {
      type: String,
      default: "",
      trim: true,
    },

    // media
    images: {
      type: [String], // Cloudinary URLs
      default: [],
    },
    video: {
      type: String, // Cloudinary URL
      default: "",
    },

    caption: {
      type: String,
      default: "",
      trim: true,
    },

    // social
    likes: {
      type: [Schema.Types.ObjectId],
      ref: "User",
      default: [],
    },

    comments: {
      type: [commentSchema],
      default: [],
    },
  },
  {
    timestamps: true,             // adds createdAt & updatedAt
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

/* ── Virtual counts (handy for clients) ─────────────────────────────── */
postSchema.virtual("likesCount").get(function () {
  return Array.isArray(this.likes) ? this.likes.length : 0;
});
postSchema.virtual("commentsCount").get(function () {
  return Array.isArray(this.comments) ? this.comments.length : 0;
});

/* ── Indexes for common queries ─────────────────────────────────────── */
postSchema.index({ createdAt: -1 });
postSchema.index({ userId: 1, createdAt: -1 });
postSchema.index({ type: 1, createdAt: -1 });

module.exports = mongoose.models.Post || mongoose.model("Post", postSchema);
