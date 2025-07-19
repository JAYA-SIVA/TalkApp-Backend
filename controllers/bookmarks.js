// backend/controllers/bookmarks.js
const User = require("../models/User");
const Post = require("../models/Post");

// Save or Unsave a post
exports.toggleBookmark = async (req, res) => {
  try {
    const { userId, postId } = req.body;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const postExists = await Post.findById(postId);
    if (!postExists) return res.status(404).json({ error: "Post not found" });

    const isBookmarked = user.savedPosts.includes(postId);

    if (isBookmarked) {
      // Remove from savedPosts
      user.savedPosts.pull(postId);
      await user.save();
      return res.status(200).json({ message: "Post removed from bookmarks" });
    } else {
      // Add to savedPosts
      user.savedPosts.push(postId);
      await user.save();
      return res.status(200).json({ message: "Post bookmarked successfully" });
    }
  } catch (error) {
    res.status(500).json({ error: "Bookmark operation failed", details: error.message });
  }
};

// Get all bookmarked posts for a user
exports.getBookmarkedPosts = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId).populate("savedPosts");
    if (!user) return res.status(404).json({ error: "User not found" });

    res.status(200).json(user.savedPosts);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch bookmarks", details: error.message });
  }
};
