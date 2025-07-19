// backend/controllers/talk.js
const Post = require("../models/Post");
const User = require("../models/User");
const cloudinary = require("cloudinary").v2;

// Upload a post (image or video)
exports.uploadPost = async (req, res) => {
  try {
    const { caption, userId } = req.body;
    const file = req.file?.path;

    if (!file) {
      return res.status(400).json({ error: "Media file is required" });
    }

    // Upload media to Cloudinary
    const result = await cloudinary.uploader.upload(file, {
      folder: "posts",
      resource_type: "auto",
    });

    const newPost = await Post.create({
      caption,
      mediaUrl: result.secure_url,
      mediaType: result.resource_type.startsWith("video") ? "video" : "image",
      postedBy: userId,
    });

    res.status(201).json({ message: "Post uploaded successfully", post: newPost });
  } catch (error) {
    res.status(500).json({ error: "Post upload failed", details: error.message });
  }
};

// Get all posts for feed
exports.getFeed = async (req, res) => {
  try {
    const posts = await Post.find({})
      .sort({ createdAt: -1 })
      .populate("postedBy", "username profilePic")
      .populate("comments.userId", "username profilePic");

    res.status(200).json(posts);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch feed", details: error.message });
  }
};

// Like or Unlike a post
exports.toggleLike = async (req, res) => {
  try {
    const { postId, userId } = req.body;

    const post = await Post.findById(postId);
    if (!post) return res.status(404).json({ error: "Post not found" });

    const isLiked = post.likes.includes(userId);

    if (isLiked) {
      post.likes.pull(userId);
    } else {
      post.likes.push(userId);
    }

    await post.save();
    res.status(200).json({ message: isLiked ? "Unliked" : "Liked", likes: post.likes.length });
  } catch (error) {
    res.status(500).json({ error: "Failed to like/unlike", details: error.message });
  }
};

// Add a comment to a post
exports.addComment = async (req, res) => {
  try {
    const { postId, userId, text } = req.body;

    const post = await Post.findById(postId);
    if (!post) return res.status(404).json({ error: "Post not found" });

    const newComment = {
      userId,
      text,
      timestamp: new Date(),
    };

    post.comments.push(newComment);
    await post.save();

    res.status(200).json({ message: "Comment added", comment: newComment });
  } catch (error) {
    res.status(500).json({ error: "Failed to add comment", details: error.message });
  }
};
