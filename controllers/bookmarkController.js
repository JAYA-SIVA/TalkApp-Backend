const mongoose = require("mongoose");
const Bookmark = require("../models/Bookmark");
const Post = require("../models/Post");

// ✅ Toggle bookmark (add or remove)
exports.toggleBookmark = async (req, res) => {
  try {
    const userId = req.user._id; // 🔐 Authenticated user from JWT
    const { postId } = req.body;

    // Check presence
    if (!postId) {
      return res.status(400).json({ message: "postId is required" });
    }

    // Validate ObjectIds
    if (!mongoose.Types.ObjectId.isValid(userId) || !mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({ message: "Invalid userId or postId" });
    }

    // Check if bookmark already exists
    const existing = await Bookmark.findOne({ userId, postId });

    if (existing) {
      await Bookmark.findByIdAndDelete(existing._id);
      return res.status(200).json({ message: "Bookmark removed" });
    }

    // Add new bookmark
    const bookmark = await Bookmark.create({ userId, postId });
    res.status(201).json({ message: "Bookmark added", bookmark });

  } catch (err) {
    console.error("🔴 Bookmark Error:", err.message);
    res.status(500).json({ message: "Internal server error" });
  }
};

// 📥 Get all bookmarks for the logged-in user (with post details)
exports.getUserBookmarks = async (req, res) => {
  try {
    const userId = req.user._id; // 🔐 From JWT

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Invalid userId" });
    }

    const bookmarks = await Bookmark.find({ userId }).populate("postId");

    res.status(200).json(bookmarks);

  } catch (err) {
    console.error("🔴 Fetch Bookmarks Error:", err.message);
    res.status(500).json({ message: "Internal server error" });
  }
};
