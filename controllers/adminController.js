const User = require("../models/User");
const Post = require("../models/Post");
const Report = require("../models/Report"); // You need to create this model
const mongoose = require("mongoose");

// 🚫 Block a user
exports.blockUser = async (req, res) => {
  const { userId } = req.params;

  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    user.isBlocked = true;
    await user.save();

    res.status(200).json({ message: "User has been blocked." });
  } catch (err) {
    console.error("Block error:", err);
    res.status(500).json({ error: "Failed to block user" });
  }
};

// ✅ Unblock a user
exports.unblockUser = async (req, res) => {
  const { userId } = req.params;

  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    user.isBlocked = false;
    await user.save();

    res.status(200).json({ message: "User has been unblocked." });
  } catch (err) {
    console.error("Unblock error:", err);
    res.status(500).json({ error: "Failed to unblock user" });
  }
};

// 🗑️ Delete a post
exports.deletePost = async (req, res) => {
  const { postId } = req.params;

  try {
    const post = await Post.findById(postId);
    if (!post) return res.status(404).json({ error: "Post not found" });

    await Post.findByIdAndDelete(postId);

    res.status(200).json({ message: "Post deleted successfully." });
  } catch (err) {
    console.error("Delete post error:", err);
    res.status(500).json({ error: "Failed to delete post" });
  }
};

// ⚠️ Report a user or post
exports.report = async (req, res) => {
  const { targetId, type, reason } = req.body;
  const reporterId = req.user._id;

  try {
    const newReport = new Report({
      reporter: reporterId,
      target: targetId,
      type, // 'user' or 'post'
      reason
    });

    await newReport.save();
    res.status(201).json({ message: "Report submitted." });
  } catch (err) {
    console.error("Report error:", err);
    res.status(500).json({ error: "Failed to submit report" });
  }
};

// 👁️ View all reports (admin only)
exports.getAllReports = async (req, res) => {
  try {
    const reports = await Report.find({})
      .populate("reporter", "username")
      .sort({ createdAt: -1 });

    res.status(200).json(reports);
  } catch (err) {
    console.error("Fetch reports error:", err);
    res.status(500).json({ error: "Failed to fetch reports" });
  }
};
