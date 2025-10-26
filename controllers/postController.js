const mongoose = require("mongoose");
const Post = require("../models/Post");
const Reel = require("../models/reel"); // match models/reel.js
const User = require("../models/User");
const cloudinary = require("../config/cloudinary");
const createNotification = require("../utils/createNotification");
const crypto = require("crypto");

/* ─────────────────────────────────────────────
 * Paging & scoring constants
 * ───────────────────────────────────────────── */
const MAX_LIMIT = 300;
const DEFAULT_LIMIT = 300; // was 50 → now 300 by default
const FETCH_POOL_MULTIPLIER = 2; // fetch pool = 2x page size before scoring

/* ---------------- small helpers ---------------- */
function clampLimit(raw) {
  const n = Number(raw) || DEFAULT_LIMIT;
  return Math.min(Math.max(n, 1), MAX_LIMIT);
}
function parsePage(raw) {
  const p = Number(raw) || 1;
  return Math.max(p, 1);
}

/* ---------------- notify followers on upload ---------------- */
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

/* ---------------- create post ---------------- */
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
    res.status(201).json(post);
  } catch (err) {
    console.error("createPost error:", err);
    res.status(500).json({ message: err.message });
  }
};

/* ---------------- shuffle helpers ---------------- */
function timeDecay(ageHours, tau = 20) {
  return Math.exp(-ageHours / tau);
}
// per-request seed so every reload reshuffles (or pass ?seed=foo to stabilize)
function jitter(seed, itemId, delta = 0.45) {
  const h = crypto.createHash("sha1").update(`${seed}|${itemId}`).digest("hex");
  const u = parseInt(h.slice(0, 8), 16) / 0xffffffff;
  return (u * 2 - 1) * delta; // [-delta, +delta]
}

/* Normalize Post → feed item */
function toPostItem(p) {
  return {
    _id: p._id,
    id: p._id.toString(),
    key: `post:${p._id.toString()}`,
    userId: p.userId, // populated
    type: p.type || "post",
    text: p.text || "",
    caption: p.caption || "",
    images: Array.isArray(p.images) ? p.images : [],
    video: p.video || "",
    likes: p.likes || [], // ids
    likesCount: (p.likes || []).length,
    comments: (p.comments || []).map((c) => ({
      userId: c.userId, // populated
      comment: c.comment,
      createdAt: c.createdAt,
    })),
    commentsCount: (p.comments || []).length,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

/* Normalize Reel → feed item (post-like shape) */
function toReelItem(r) {
  return {
    _id: r._id,
    id: r._id.toString(),
    key: `reel:${r._id.toString()}`,
    userId: r.userId, // populated
    type: "reel",
    text: "",
    caption: r.caption || "",
    images: [],
    video: r.videoUrl || "",
    likes: r.likes || [],
    likesCount: (r.likes || []).length,
    comments: (r.comments || []).map((c) => ({
      userId: c.userId, // populated
      comment: c.text,
      createdAt: c.createdAt,
    })),
    commentsCount: (r.comments || []).length,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

/* ====== Global feed: Posts + Reels (ARRAY, soft follow boost, reshuffle) ====== */
exports.getAllPosts = async (req, res) => {
  try {
    const viewerId = req.user?._id?.toString() || "";
    const shuffleSeed = (req.query.seed || Date.now().toString());

    // pagination (headers only; body stays ARRAY)
    const page = parsePage(req.query.page);
    const limit = clampLimit(req.query.limit);
    const start = (page - 1) * limit;
    const end = start + limit;

    // following set for viewer
    let followingSet = new Set();
    if (req.user?._id) {
      const me = await User.findById(req.user._id).select("following");
      followingSet = new Set((me?.following || []).map((id) => id.toString()));
    }

    // fetch a pool (2x page size) of recent posts & reels to keep scoring light
    const poolSize = limit * FETCH_POOL_MULTIPLIER;

    const [posts, reelsRaw] = await Promise.all([
      Post.find({})
        .sort({ createdAt: -1 })
        .limit(poolSize)
        .populate("userId", "username profilePic")
        .populate("comments.userId", "username profilePic")
        .lean(),
      Reel.find({})
        .sort({ createdAt: -1 })
        .limit(poolSize)
        .populate("userId", "username profilePic")
        .populate("comments.userId", "username profilePic")
        .lean(),
    ]);

    const combined = [...posts.map(toPostItem), ...reelsRaw.map(toReelItem)];

    // SOFT follow boost (time-limited) + recency + engagement + jitter
    const scored = combined.map((item) => {
      const authorId = item.userId?._id?.toString?.() || item.userId?.toString?.() || "";
      const isFollowed = followingSet.has(authorId);
      const isSelf = authorId === viewerId;
      const ageHours = (Date.now() - new Date(item.createdAt).getTime()) / 3600000;

      // We keep recency light, to avoid "always first" for new uploads
      const recency = timeDecay(ageHours); // 0..1
      const engagement =
        Math.min((item.likesCount || 0) / 50, 1) * 0.35 +
        Math.min((item.commentsCount || 0) / 20, 1) * 0.65;

      // follow boost only for fresh content (first 1h), then decays quickly
      const freshWindowHrs = 1;
      const freshFactor = Math.max(0, 1 - ageHours / freshWindowHrs); // 1..0 over 1h
      const followBoost = isFollowed ? 0.35 * freshFactor : 0;

      // self posts should NOT be pinned — give them no follow boost and extra randomness
      const selfPenalty = isSelf ? -0.15 : 0;

      // lighter recency, strong jitter
      const rand = jitter(shuffleSeed, item.id, 0.45);

      const score = selfPenalty + followBoost + recency * 0.2 + engagement * 0.2 + rand;
      return { ...item, __score: score };
    });

    // sort by score (higher first)
    scored.sort((a, b) => b.__score - a.__score);

    // paginate from scored pool
    const slice = scored.slice(start, end).map(({ __score, ...rest }) => rest);

    // NO-CACHE headers to avoid stale mixes (important for Android/OkHttp/CDNs)
    res.set({
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      "Pragma": "no-cache",
      "Expires": "0",
      "Surrogate-Control": "no-store",
      "X-Feed-Page": String(page),
      "X-Feed-Limit": String(limit),
      "X-Feed-Total": String(scored.length),
      "X-Feed-Has-Next": String(end < scored.length),
      "X-Feed-Seed": shuffleSeed,
    });

    return res.json(slice);
  } catch (err) {
    console.error("getAllPosts feed error:", err);
    res.status(500).json({ message: err.message });
  }
};

/* ====== Reels-only feed: shuffled (ARRAY, mirrors post shape for frontend) ====== */
exports.getReelsFeed = async (req, res) => {
  try {
    const viewerId = req.user?._id?.toString() || "";
    const shuffleSeed = (req.query.seed || Date.now().toString());

    const page = parsePage(req.query.page);
    const limit = clampLimit(req.query.limit);
    const start = (page - 1) * limit;
    const end = start + limit;

    let followingSet = new Set();
    if (req.user?._id) {
      const me = await User.findById(req.user._id).select("following");
      followingSet = new Set((me?.following || []).map((id) => id.toString()));
    }

    const poolSize = limit * FETCH_POOL_MULTIPLIER;

    const reelsRaw = await Reel.find({})
      .sort({ createdAt: -1 })
      .limit(poolSize)
      .populate("userId", "username profilePic")
      .populate("comments.userId", "username profilePic")
      .lean();

    const items = reelsRaw.map(toReelItem);

    const scored = items.map((item) => {
      const authorId = item.userId?._id?.toString?.() || item.userId?.toString?.() || "";
      const isFollowed = followingSet.has(authorId);
      const isSelf = authorId === viewerId;
      const ageHours = (Date.now() - new Date(item.createdAt).getTime()) / 3600000;

      const recency = timeDecay(ageHours);
      const engagement =
        Math.min((item.likesCount || 0) / 50, 1) * 0.35 +
        Math.min((item.commentsCount || 0) / 20, 1) * 0.65;

      const freshWindowHrs = 1;
      const freshFactor = Math.max(0, 1 - ageHours / freshWindowHrs);
      const followBoost = isFollowed ? 0.35 * freshFactor : 0;
      const selfPenalty = isSelf ? -0.15 : 0;
      const rand = jitter(shuffleSeed, item.id, 0.45);

      const score = selfPenalty + followBoost + recency * 0.2 + engagement * 0.2 + rand;
      return { ...item, __score: score };
    });

    scored.sort((a, b) => b.__score - a.__score);

    const slice = scored.slice(start, end).map(({ __score, ...rest }) => rest);

    res.set({
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      "Pragma": "no-cache",
      "Expires": "0",
      "Surrogate-Control": "no-store",
      "X-Feed-Page": String(page),
      "X-Feed-Limit": String(limit),
      "X-Feed-Total": String(scored.length),
      "X-Feed-Has-Next": String(end < scored.length),
      "X-Feed-Seed": shuffleSeed,
    });

    return res.json(slice);
  } catch (err) {
    console.error("getReelsFeed error:", err);
    res.status(500).json({ message: err.message });
  }
};

/* ------ Profile feed: Posts + Reels by user (ARRAY, newest first) ------ */
exports.getPostsByUser = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Invalid userId" });
    }

    const page = parsePage(req.query.page);
    const limit = clampLimit(req.query.limit);
    const start = (page - 1) * limit;
    const end = start + limit;

    // pull a pool to sort + slice locally (keeps output consistent with mixed types)
    const poolSize = limit * FETCH_POOL_MULTIPLIER;

    const [posts, reelsRaw] = await Promise.all([
      Post.find({ userId })
        .sort({ createdAt: -1 })
        .limit(poolSize)
        .populate("userId", "username profilePic")
        .populate("comments.userId", "username profilePic")
        .lean(),
      Reel.find({ userId })
        .sort({ createdAt: -1 })
        .limit(poolSize)
        .populate("userId", "username profilePic")
        .populate("comments.userId", "username profilePic")
        .lean(),
    ]);

    const combined = [
      ...posts.map(toPostItem),
      ...reelsRaw.map(toReelItem),
    ];

    combined.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const slice = combined.slice(start, end);

    res.set({
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      "Pragma": "no-cache",
      "Expires": "0",
      "Surrogate-Control": "no-store",
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

/* --------------------------------- Like (atomic, no duplicate) ---------------------------------- */
exports.likePost = async (req, res) => {
  try {
    const postId = req.params.id;
    const actorId = req.user._id.toString();

    const updated = await Post.findByIdAndUpdate(
      postId,
      { $addToSet: { likes: req.user._id } }, // atomic → no duplicates
      { new: true, runValidators: false }
    ).select("likes userId");

    if (!updated) return res.status(404).json({ message: "Post not found" });

    if (updated.userId.toString() !== actorId) {
      try {
        const actor = await User.findById(actorId).select("username");
        await createNotification({
          userId: updated.userId.toString(),
          fromUserId: actorId,
          type: "like",
          postId: postId,
          message: `${actor?.username || "Someone"} liked your post`,
        });
      } catch (e) {
        console.error("notify like:", e.message);
      }
    }

    return res.json({
      message: "Post liked",
      likes: updated.likes,
      likesCount: updated.likes.length,
    });
  } catch (err) {
    console.error("likePost error:", err);
    res.status(500).json({ message: err.message });
  }
};

/* -------------------------------- Unlike (atomic) --------------------------------- */
exports.unlikePost = async (req, res) => {
  try {
    const postId = req.params.id;

    const updated = await Post.findByIdAndUpdate(
      postId,
      { $pull: { likes: req.user._id } }, // atomic
      { new: true, runValidators: false }
    ).select("likes");

    if (!updated) return res.status(404).json({ message: "Post not found" });

    return res.json({
      message: "Post unliked",
      likes: updated.likes,
      likesCount: updated.likes.length,
    });
  } catch (err) {
    console.error("unlikePost error:", err);
    res.status(500).json({ message: err.message });
  }
};

/* -------------------------------- Comment (atomic push + counts) -------------------------------- */
exports.commentPost = async (req, res) => {
  try {
    const { comment } = req.body;
    if (!comment || comment.trim().length === 0) {
      return res.status(400).json({ message: "Comment text is required" });
    }

    const postId = req.params.id;
    const actorId = req.user._id.toString();

    const newComment = {
      userId: req.user._id,
      comment: comment.trim(),
      createdAt: new Date(),
    };

    const updated = await Post.findByIdAndUpdate(
      postId,
      { $push: { comments: newComment } }, // atomic append
      { new: true, runValidators: false }
    ).select("comments userId");

    if (!updated) return res.status(404).json({ message: "Post not found" });

    // notify owner
    if (updated.userId.toString() !== actorId) {
      try {
        const actor = await User.findById(actorId).select("username");
        await createNotification({
          userId: updated.userId.toString(),
          fromUserId: actorId,
          type: "comment",
          postId: postId,
          message: `${actor?.username || "Someone"} commented on your post`,
        });
      } catch (e) {
        console.error("notify comment:", e.message);
      }
    }

    return res.status(201).json({
      message: "Comment added",
      comments: updated.comments,
      commentsCount: updated.comments.length,
    });
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
    res.json({
      comments: post.comments || [],
      commentsCount: (post.comments || []).length,
    });
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
    console.error("deletePost error:", err);
    res.status(500).json({ message: err.message });
  }
};

/* ------------------------------- Aliases --------------------------------- */
exports.addComment = exports.commentPost;
