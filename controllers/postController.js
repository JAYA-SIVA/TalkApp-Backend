// controllers/postController.js
const mongoose = require("mongoose");
const Post = require("../models/Post");
const User = require("../models/User");
const cloudinary = require("../config/cloudinary");
const createNotification = require("../utils/createNotification"); // 🔔 helper

/* ------------------------------- Create post ------------------------------ */
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

/* -------------------------------- Get all -------------------------------- */
exports.getAllPosts = async (req, res) => {
  try {
    const posts = await Post.find()
      .sort({ createdAt: -1 })
      .populate("userId", "username profilePic")
      .populate("comments.userId", "username profilePic");

    res.json(posts);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ---------------------------- Get one by id ------------------------------- */
exports.getPostById = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id)
      .populate("userId", "username profilePic")
      .populate("comments.userId", "username profilePic")
      .populate("likes", "username profilePic");
    if (!post) return res.status(404).json({ message: "Post not found" });
    res.json(post);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ------------------------- Posts by a given user -------------------------- */
exports.getPostsByUser = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Invalid userId" });
    }

    const posts = await Post.find({ userId })
      .sort({ createdAt: -1 })
      .populate("userId", "username profilePic");

    res.json(posts);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* --------------------------------- Like ---------------------------------- */
exports.likePost = async (req, res) => {
  try {
    const postId = req.params.id;
    const actorId = req.user._id.toString();

    const post = await Post.findById(postId);
    if (!post) return res.status(404).json({ message: "Post not found" });

    post.likes = post.likes || [];
    const already = post.likes.some((id) => id.toString() === actorId);
    if (already) {
      const updated = await Post.findById(postId).populate("likes", "username profilePic");
      return res.json({ message: "Already liked", likes: updated.likes });
    }

    post.likes.push(req.user._id);
    await post.save();

    // 🔔 Notify owner (skip self-like)
    if (post.userId.toString() !== actorId) {
      try {
        const actor = await User.findById(actorId).select("username");
        await createNotification({
          userId: post.userId.toString(),
          fromUserId: actorId,
          type: "like",
          postId: post._id.toString(),
          message: `${actor?.username || "Someone"} liked your post`,
        });
      } catch (e) {
        console.error("notify like:", e.message);
      }
    }

    const updated = await Post.findById(postId).populate("likes", "username profilePic");
    res.json({ message: "Post liked", likes: updated.likes });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* -------------------------------- Unlike --------------------------------- */
exports.unlikePost = async (req, res) => {
  try {
    const postId = req.params.id;
    const actorId = req.user._id.toString();

    const post = await Post.findById(postId);
    if (!post) return res.status(404).json({ message: "Post not found" });

    post.likes = (post.likes || []).filter((id) => id.toString() !== actorId);
    await post.save();

    const updated = await Post.findById(postId).populate("likes", "username profilePic");
    res.json({ message: "Post unliked", likes: updated.likes });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* -------------------------------- Comment -------------------------------- */
exports.commentPost = async (req, res) => {
  try {
    // NOTE: client sends { comment: "..." }
    const { comment } = req.body;
    if (!comment || comment.trim().length === 0) {
      return res.status(400).json({ message: "Comment text is required" });
    }

    const postId = req.params.id;
    const actorId = req.user._id.toString();

    const post = await Post.findById(postId);
    if (!post) return res.status(404).json({ message: "Post not found" });

    post.comments = post.comments || [];
    post.comments.push({
      userId: req.user._id,
      comment: comment.trim(),
      createdAt: new Date(),
    });

    await post.save();

    // 🔔 Notify owner (skip self-comment)
    if (post.userId.toString() !== actorId) {
      try {
        const actor = await User.findById(actorId).select("username");
        await createNotification({
          userId: post.userId.toString(),
          fromUserId: actorId,
          type: "comment",
          postId: post._id.toString(),
          message: `${actor?.username || "Someone"} commented on your post`,
        });
      } catch (e) {
        console.error("notify comment:", e.message);
      }
    }

    const updated = await Post.findById(postId).populate("comments.userId", "username profilePic");
    res.status(201).json({ message: "Comment added", comments: updated.comments });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ------------------------------ Get comments ----------------------------- */
exports.getComments = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id)
      .select("comments")
      .populate("comments.userId", "username profilePic");
    if (!post) return res.status(404).json({ message: "Post not found" });
    res.json(post.comments || []);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* --------------------------------- Delete -------------------------------- */
exports.deletePost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });

    if (post.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Unauthorized to delete this post" });
    }

    // Optional: Cloudinary cleanup
    if (post.images && post.images.length > 0) {
      for (let imageUrl of post.images) {
        const publicId = imageUrl.split("/").pop().split(".")[0];
        try {
          await cloudinary.uploader.destroy(`posts/${publicId}`, { resource_type: "image" });
        } catch (e) {
          console.warn("cloudinary image destroy failed:", publicId, e.message);
        }
      }
    }

    if (post.video) {
      const publicId = post.video.split("/").pop().split(".")[0];
      try {
        await cloudinary.uploader.destroy(`posts/${publicId}`, { resource_type: "video" });
      } catch (e) {
        console.warn("cloudinary video destroy failed:", publicId, e.message);
      }
    }

    await Post.findByIdAndDelete(req.params.id);
    res.status(200).json({ message: "Post deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ------------------------------- Aliases --------------------------------- */
// If your routes expect /comment/:id -> addComment
exports.addComment = exports.commentPost;
