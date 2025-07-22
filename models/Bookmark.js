const mongoose = require("mongoose");

const bookmarkSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  postId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Post",
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// ✅ Ensure unique combination of userId and postId to avoid duplicates
bookmarkSchema.index({ userId: 1, postId: 1 }, { unique: true });

module.exports = mongoose.model("Bookmark", bookmarkSchema);
