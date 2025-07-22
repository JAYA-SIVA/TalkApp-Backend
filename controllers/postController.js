// controllers/postController.js

const Post = require("../models/Post");

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

exports.getAllPosts = async (req, res) => {
  try {
    const posts = await Post.find()
      .sort({ createdAt: -1 })
      .populate("userId", "username profilePic");
    res.json(posts);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.likePost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post.likes.includes(req.user._id)) {
      post.likes.push(req.user._id);
      await post.save();
    }
    res.json({ message: "Post liked" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.unlikePost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    post.likes = post.likes.filter(
      (userId) => userId.toString() !== req.user._id.toString()
    );
    await post.save();
    res.json({ message: "Post unliked" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.commentPost = async (req, res) => {
  try {
    const { comment } = req.body;
    const post = await Post.findById(req.params.id);

    post.comments.push({
      userId: req.user._id,
      comment,
    });

    await post.save();
    res.json(post.comments);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
