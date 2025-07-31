const Post = require("../models/Post");
const cloudinary = require("../config/cloudinary"); // ✅ Cloudinary import
const mongoose = require("mongoose");

// 📤 Create a new post
exports.createPost = async (req, res) => {
  try {
    const { type, text, images, video, caption } = req.body;

    const post = await Post.create({
      userId: req.user._id,
      type,
      text,
      images,
      video,
      caption,
    });

    res.status(201).json(post);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// 📥 Get all posts
exports.getAllPosts = async (req, res) => {
  try {
    const posts = await Post.find()
      .sort({ createdAt: -1 })
      .populate("userId", "username profilePic")
      .populate("comments.userId", "username profilePic"); // ✅ populate comment user info

    res.json(posts);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// 👍 Like a post
exports.likePost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });

    if (!post.likes.includes(req.user._id)) {
      post.likes.push(req.user._id);
      await post.save();
    }

    const updated = await Post.findById(req.params.id).populate("likes", "username profilePic");
    res.json({ message: "Post liked", likes: updated.likes });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// 👎 Unlike a post
exports.unlikePost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });

    post.likes = post.likes.filter(
      (userId) => userId.toString() !== req.user._id.toString()
    );
    await post.save();

    const updated = await Post.findById(req.params.id).populate("likes", "username profilePic");
    res.json({ message: "Post unliked", likes: updated.likes });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// 💬 Comment on a post
exports.commentPost = async (req, res) => {
  try {
    const { comment } = req.body;
    if (!comment || comment.trim().length === 0) {
      return res.status(400).json({ message: "Comment text is required" });
    }

    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });

    post.comments.push({
      userId: req.user._id,
      comment: comment.trim(),
    });

    await post.save();

    const updated = await Post.findById(req.params.id).populate("comments.userId", "username profilePic");
    res.status(201).json({ message: "Comment added", comments: updated.comments });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ❌ Delete a post (with Cloudinary cleanup)
exports.deletePost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });

    if (post.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Unauthorized to delete this post" });
    }

    // ✅ Optional: Cloudinary delete
    if (post.images && post.images.length > 0) {
      for (let imageUrl of post.images) {
        const publicId = imageUrl.split("/").pop().split(".")[0];
        await cloudinary.uploader.destroy(`posts/${publicId}`, { resource_type: "image" });
      }
    }

    if (post.video) {
      const publicId = post.video.split("/").pop().split(".")[0];
      await cloudinary.uploader.destroy(`posts/${publicId}`, { resource_type: "video" });
    }

    await Post.findByIdAndDelete(req.params.id);
    res.status(200).json({ message: "Post deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
