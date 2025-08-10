// controllers/talk.js
const mongoose = require("mongoose");
const Post = require("../models/Post");
const User = require("../models/User");
const Notification = require("../models/Notification"); // inline helper uses this

/* ─────────────────────────────────────────
   🔔 Inline Notification Helper (no utils file)
   Emits Socket.IO event if global.io is available
   ───────────────────────────────────────── */
async function createNotification({ userId, fromUserId, type, postId = null, message = "" }) {
  try {
    if (!userId || !fromUserId || !type) return;
    if (String(userId) === String(fromUserId)) return; // don't notify self

    const n = await Notification.create({
      userId,
      fromUserId,
      type,       // "like" | "comment" | "follow" | "message"
      postId,
      message,
      seen: false,
    });

    if (global.io) {
      global.io.to(String(userId)).emit("notification:new", {
        _id: n._id,
        type,
        fromUserId,
        postId,
        message,
        seen: false,
        createdAt: n.createdAt,
      });
    }
  } catch (e) {
    console.error("notify error:", e.message);
  }
}

/* ─────────────────────────────────────────
   Helper: return fresh populated post
   ───────────────────────────────────────── */
const sendFresh = async (postId, res, okMsg = "OK") => {
  const fresh = await Post.findById(postId)
    .populate("userId", "username profilePic")
    .populate("comments.userId", "username profilePic");
  if (!fresh) return res.status(404).json({ success: false, message: "Post not found" });
  return res.json({
    success: true,
    message: okMsg,
    post: fresh,
    likesCount: fresh.likes?.length || 0,
  });
};

/* ─────────────────────────────────────────
   📤 Upload a post
   expects multer single file in req.file (field: "media")
   ───────────────────────────────────────── */
exports.uploadPost = async (req, res) => {
  try {
    const { caption = "" } = req.body;
    const file = req.file;
    const userId = req.user?.id || req.user?._id;

    if (!file) return res.status(400).json({ message: "❌ Media file is required" });
    if (!userId) return res.status(401).json({ message: "❌ Unauthorized: No user ID found" });

    const mediaUrl = file.path;
    const mediaType = file.mimetype.startsWith("image/")
      ? "image"
      : file.mimetype.startsWith("video/")
      ? "video"
      : "other";

    const detectedType = mediaType === "video" ? "reel" : "post";

    const newPost = new Post({
      userId,
      type: detectedType,
      caption,
      images: mediaType === "image" ? [mediaUrl] : [],
      video: mediaType === "video" ? mediaUrl : "",
      createdAt: new Date(),
    });

    const savedPost = await newPost.save();
    const populated = await savedPost.populate("userId", "username profilePic");

    res.status(201).json({ message: "✅ Post uploaded", post: populated });
  } catch (error) {
    console.error("❌ Upload failed:", error);
    res.status(500).json({ message: "Upload failed", error: error.message });
  }
};

/* ─────────────────────────────────────────
   📥 Get all posts (Home Feed)
   ───────────────────────────────────────── */
exports.getAllPosts = async (req, res) => {
  try {
    const posts = await Post.find()
      .sort({ createdAt: -1 })
      .populate("userId", "username profilePic");
    res.status(200).json(posts);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch posts", error: error.message });
  }
};

/* ─────────────────────────────────────────
   📽️ Get Reels (video-only)
   ───────────────────────────────────────── */
exports.getReels = async (req, res) => {
  try {
    const posts = await Post.find({
      $or: [{ type: "reel" }, { video: { $exists: true, $ne: "" } }],
    })
      .sort({ createdAt: -1 })
      .populate("userId", "username profilePic");

    res.status(200).json(posts);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch reels", error: error.message });
  }
};

/* ─────────────────────────────────────────
   🆔 Get post by ID
   ───────────────────────────────────────── */
exports.getPostById = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id)
      .populate("userId", "username profilePic");
    if (!post) return res.status(404).json({ message: "Post not found" });
    res.status(200).json(post);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch post", error: error.message });
  }
};

/* ─────────────────────────────────────────
   👤 Get posts by User ID
   ───────────────────────────────────────── */
exports.getPostsByUser = async (req, res) => {
  try {
    const posts = await Post.find({ userId: req.params.id })
      .sort({ createdAt: -1 })
      .populate("userId", "username profilePic");
    res.status(200).json(posts);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch user posts", error: error.message });
  }
};

/* ─────────────────────────────────────────
   🔍 Get posts by Username
   ───────────────────────────────────────── */
exports.getPostsByUsername = async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username });
    if (!user) return res.status(404).json({ message: "User not found" });

    const posts = await Post.find({ userId: user._id })
      .sort({ createdAt: -1 })
      .populate("userId", "username profilePic");
    res.status(200).json(posts);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch posts by username", error: error.message });
  }
};

/* ─────────────────────────────────────────
   ❤️ Like a post (idempotent + notification)
   ───────────────────────────────────────── */
exports.likePost = async (req, res) => {
  try {
    const postId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({ success: false, message: "Invalid post id" });
    }

    const actorId = (req.user?._id || req.user?.id)?.toString();
    if (!actorId) return res.status(401).json({ success: false, message: "Unauthorized" });

    const post = await Post.findById(postId);
    if (!post) return res.status(404).json({ success: false, message: "Post not found" });

    const alreadyLiked = (post.likes || []).some((id) => id.toString() === actorId);
    if (alreadyLiked) {
      // No duplicate action / notify
      return sendFresh(postId, res, "Already liked");
    }

    post.likes = post.likes || [];
    post.likes.push(new mongoose.Types.ObjectId(actorId));
    await post.save();

    // 🔔 Notify post owner (skip self-like)
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

    return sendFresh(postId, res, "Post liked");
  } catch (error) {
    console.error("Like failed:", error);
    res.status(500).json({ success: false, message: "Like failed", error: error.message });
  }
};

/* ─────────────────────────────────────────
   💔 Unlike a post (atomic)
   ───────────────────────────────────────── */
exports.unlikePost = async (req, res) => {
  try {
    const postId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({ success: false, message: "Invalid post id" });
    }

    const actorId = (req.user?._id || req.user?.id)?.toString();
    if (!actorId) return res.status(401).json({ success: false, message: "Unauthorized" });

    const uid = new mongoose.Types.ObjectId(actorId);

    await Post.findByIdAndUpdate(
      postId,
      { $pull: { likes: uid } },
      { new: true }
    );

    return sendFresh(postId, res, "Post unliked");
  } catch (error) {
    console.error("Unlike failed:", error);
    res.status(500).json({ success: false, message: "Unlike failed", error: error.message });
  }
};

/* ─────────────────────────────────────────
   💬 Add comment (accepts body.comment OR body.text)
   + notification
   ───────────────────────────────────────── */
exports.addComment = async (req, res) => {
  try {
    const bodyText = typeof req.body?.comment === "string" ? req.body.comment : req.body?.text;
    const text = (bodyText || "").trim();
    if (!text) {
      return res.status(400).json({ message: "Comment text is required" });
    }

    const actorId = (req.user?._id || req.user?.id)?.toString();
    if (!actorId) return res.status(401).json({ message: "Unauthorized" });

    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });

    post.comments = post.comments || [];
    post.comments.push({
      userId: new mongoose.Types.ObjectId(actorId),
      comment: text,
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

    const populated = await Post.findById(post._id)
      .populate("comments.userId", "username profilePic");

    res.status(201).json({
      success: true,
      message: "Comment added",
      comments: populated?.comments || [],
    });
  } catch (error) {
    res.status(500).json({ message: "Comment failed", error: error.message });
  }
};

/* ─────────────────────────────────────────
   🗨️ Get comments of a post
   ───────────────────────────────────────── */
exports.getComments = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id)
      .populate("comments.userId", "username profilePic");
    if (!post) return res.status(404).json({ message: "Post not found" });

    res.status(200).json(post.comments || []);
  } catch (error) {
    res.status(500).json({ message: "Failed to get comments", error: error.message });
  }
};

/* ─────────────────────────────────────────
   ❌ Delete post
   ───────────────────────────────────────── */
exports.deletePost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });

    if (post.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Unauthorized: Cannot delete others' posts" });
    }

    await Post.findByIdAndDelete(req.params.id);
    res.status(200).json({ message: "Post deleted" });
  } catch (error) {
    res.status(500).json({ message: "Delete failed", error: error.message });
  }
};
