const mongoose = require("mongoose");
const Post = require("../models/Post");
const Reel = require("../models/reel"); // lowercase to match models/reel.js
const User = require("../models/User");
const cloudinary = require("../config/cloudinary");
const createNotification = require("../utils/createNotification");
const crypto = require("crypto");

/* ----------------------- helpers: notify followers on upload ----------------------- */
async function notifyFollowersPostUpload(authorId, postId) {
  try {
    const me = await User.findById(authorId).select("username followers");
    if (!me) return;
    const followers = Array.isArray(me.followers) ? me.followers : [];
    if (!followers.length) return;

    await Promise.allSettled(
      followers
        .map((fid) => fid?.toString())
        .filter(Boolean)
        .filter((fid) => fid !== authorId.toString())
        .map((fid) =>
          createNotification({
            userId: fid,
            fromUserId: authorId.toString(),
            type: "post_upload",
            postId: postId.toString(),
            message: `${me.username} posted a new update`,
            meta: { kind: "post" },
          })
        )
    );
  } catch (e) {
    console.error("notify post_upload:", e.message);
  }
}

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

    notifyFollowersPostUpload(req.user._id, post._id).catch(() => {});

    // return as stored (no populate) to keep IDs primitive
    res.status(201).json(post);
  } catch (err) {
    console.error("createPost error:", err);
    res.status(500).json({ message: err.message });
  }
};

/* ----------------------------- Shuffle Helpers ---------------------------- */
function timeDecay(ageHours, tau = 20) { return Math.exp(-ageHours / tau); }
function jitter(userId, itemId, bucketISO, delta = 0.05) {
  const h = crypto.createHash("sha1").update(`${userId}|${itemId}|${bucketISO}`).digest("hex");
  const u = parseInt(h.slice(0, 8), 16) / 0xffffffff;
  return (u * 2 - 1) * delta;
}

/* ------------------ Global feed: Posts + Reels (ARRAY, primitive IDs) ------------------ */
exports.getAllPosts = async (req, res) => {
  try {
    const userId = req.user?._id?.toString() || "anon";
    const bucketMs = 3 * 3600 * 1000;
    const bucketISO = new Date(Math.floor(Date.now() / bucketMs) * bucketMs).toISOString();

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const start = (page - 1) * limit;
    const end = start + limit;

    // Do NOT populate here -> keep userId/likes/comments as primitive ObjectIds
    const posts = await Post.find().lean();
    const reels = await Reel.find().lean();

    // Normalize: keep old fields (images/video) AND add media object
    const combined = [
      ...posts.map((p) => ({
        _id: p._id,
        userId: p.userId?.toString(),                     // string
        type: p.type || "post",
        caption: p.caption || p.text || "",
        images: Array.isArray(p.images) ? p.images : [],
        video: p.video || "",
        media: { images: Array.isArray(p.images) ? p.images : [], video: p.video || "" },
        likes: (p.likes || []).map((id) => id.toString()), // strings
        comments: (p.comments || []).map((c) => ({
          userId: c.userId?.toString(),
          comment: c.comment,
          createdAt: c.createdAt,
        })),
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      })),
      ...reels.map((r) => ({
        _id: r._id,
        userId: r.userId?.toString(),                     // string
        type: "reel",
        caption: r.caption || "",
        images: [],
        video: r.videoUrl || "",
        media: { images: [], video: r.videoUrl || "" },
        likes: (r.likes || []).map((id) => id.toString()), // strings
        // Convert reel comments {userId,text,createdAt} -> same shape as post comments
        comments: (r.comments || []).map((c) => ({
          userId: (c.userId || c.user)?.toString?.(),
          comment: c.text,                                 // normalize name
          createdAt: c.createdAt,
        })),
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
    ];

    // Score (recency + engagement) + deterministic jitter
    const scored = combined.map((item) => {
      const ageHours = (Date.now() - new Date(item.createdAt).getTime()) / 3600000;
      const recency = timeDecay(ageHours);
      const quality =
        Math.min((item.likes?.length || 0) / 50, 1) * 0.5 +
        Math.min((item.comments?.length || 0) / 20, 1) * 0.8;
      const base = recency * 0.6 + quality * 0.4;
      const jit = jitter(userId, item._id.toString(), bucketISO);
      return { ...item, baseScore: base + jit };
    });

    scored.sort((a, b) => b.baseScore - a.baseScore);

    // Diversify per author (max 2 per page slice)
    const cap = new Map();
    const diversified = [];
    for (const item of scored) {
      const a = item.userId || "unknown";
      const c = cap.get(a) || 0;
      if (c < 2) { diversified.push(item); cap.set(a, c + 1); }
    }

    const slice = diversified.slice(start, end);

    // Pagination via headers; BODY is ARRAY (what your app expects)
    res.set({
      "X-Feed-Page": String(page),
      "X-Feed-Limit": String(limit),
      "X-Feed-Total": String(diversified.length),
      "X-Feed-Has-Next": String(end < diversified.length),
      "X-Feed-Bucket": bucketISO,
    });

    return res.json(slice);
  } catch (err) {
    console.error("getAllPosts feed error:", err);
    res.status(500).json({ message: err.message });
  }
};

/* -------- Profile feed: Posts + Reels by user (ARRAY, primitive IDs) -------- */
exports.getPostsByUser = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Invalid userId" });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const start = (page - 1) * limit;
    const end = start + limit;

    const posts = await Post.find({ userId }).lean();
    const reels = await Reel.find({ userId }).lean();

    const combined = [
      ...posts.map((p) => ({
        _id: p._id,
        userId: p.userId?.toString(),
        type: p.type || "post",
        caption: p.caption || p.text || "",
        images: Array.isArray(p.images) ? p.images : [],
        video: p.video || "",
        media: { images: Array.isArray(p.images) ? p.images : [], video: p.video || "" },
        likes: (p.likes || []).map((id) => id.toString()),
        comments: (p.comments || []).map((c) => ({
          userId: c.userId?.toString(),
          comment: c.comment,
          createdAt: c.createdAt,
        })),
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      })),
      ...reels.map((r) => ({
        _id: r._id,
        userId: r.userId?.toString(),
        type: "reel",
        caption: r.caption || "",
        images: [],
        video: r.videoUrl || "",
        media: { images: [], video: r.videoUrl || "" },
        likes: (r.likes || []).map((id) => id.toString()),
        comments: (r.comments || []).map((c) => ({
          userId: (c.userId || c.user)?.toString?.(),
          comment: c.text,
          createdAt: c.createdAt,
        })),
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
    ];

    combined.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const slice = combined.slice(start, end);

    res.set({
      "X-Feed-Page": String(page),
      "X-Feed-Limit": String(limit),
      "X-Feed-Total": String(combined.length),
      "X-Feed-Has-Next": String(end < combined.length),
    });

    return res.json(slice);
  } catch (err) {
    console.error("getPostsByUser error:", err);
    res.status(500).json({ message: err.message });
  }
};

/* ---------------------------- Get one by id ------------------------------- */
/* keep populate here — detail screen may need author info */
exports.getPostById = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id)
      .populate("userId", "username profilePic")
      .populate("comments.userId", "username profilePic")
      .populate("likes", "username profilePic");
    if (!post) return res.status(404).json({ message: "Post not found" });
    res.json(post);
  } catch (err) {
    console.error("getPostById error:", err);
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
      const updated = await Post.findById(postId).select("likes");
      return res.json({ message: "Already liked", likes: updated.likes });
    }

    post.likes.push(req.user._id);
    await post.save();

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
      } catch (e) { console.error("notify like:", e.message); }
    }

    const updated = await Post.findById(postId).select("likes");
    res.json({ message: "Post liked", likes: updated.likes });
  } catch (err) {
    console.error("likePost error:", err);
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

    const updated = await Post.findById(postId).select("likes");
    res.json({ message: "Post unliked", likes: updated.likes });
  } catch (err) {
    console.error("unlikePost error:", err);
    res.status(500).json({ message: err.message });
  }
};

/* -------------------------------- Comment -------------------------------- */
exports.commentPost = async (req, res) => {
  try {
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
      } catch (e) { console.error("notify comment:", e.message); }
    }

    const updated = await Post.findById(postId).select("comments");
    res.status(201).json({ message: "Comment added", comments: updated.comments });
  } catch (err) {
    console.error("commentPost error:", err);
    res.status(500).json({ message: err.message });
  }
};

/* ------------------------------ Get comments ----------------------------- */
exports.getComments = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id).select("comments");
    if (!post) return res.status(404).json({ message: "Post not found" });
    res.json(post.comments || []);
  } catch (err) {
    console.error("getComments error:", err);
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

    if (post.images && post.images.length > 0) {
      for (let imageUrl of post.images) {
        const publicId = imageUrl.split("/").pop().split(".")[0];
        try {
          await cloudinary.uploader.destroy(`posts/${publicId}`, { resource_type: "image" });
        } catch (e) { console.warn("cloudinary image destroy failed:", publicId, e.message); }
      }
    }

    if (post.video) {
      const publicId = post.video.split("/").pop().split(".")[0];
      try {
        await cloudinary.uploader.destroy(`posts/${publicId}`, { resource_type: "video" });
      } catch (e) { console.warn("cloudinary video destroy failed:", publicId, e.message); }
    }

    await Post.findByIdAndDelete(req.params.id);
    res.status(200).json({ message: "Post deleted successfully" });
  } catch (err) {
    console.error("deletePost error:", err);
    res.status(500).json({ message: err.message });
  }
};

/* ------------------------------- Aliases --------------------------------- */
exports.addComment = exports.commentPost;
