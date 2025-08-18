const mongoose = require("mongoose");
const Post = require("../models/Post");
const Reel = require("../models/reel"); // match models/reel.js
const User = require("../models/User");
const cloudinary = require("../config/cloudinary");
const createNotification = require("../utils/createNotification");
const crypto = require("crypto");

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
function jitter(seed, itemId, delta = 0.05) {
  const h = crypto.createHash("sha1").update(`${seed}|${itemId}`).digest("hex");
  const u = parseInt(h.slice(0, 8), 16) / 0xffffffff;
  return (u * 2 - 1) * delta;
}

/* ================= HOME FEED (ARRAY) =================
   - merges Posts + Reels
   - followed users first
   - reshuffles on every reload
   - same field names your app expects
====================================================== */
exports.getAllPosts = async (req, res) => {
  try {
    // different on EVERY request -> reshuffle when you reload
    const shuffleSeed = Date.now().toString();

    // pagination (headers only; body stays ARRAY)
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const start = (page - 1) * limit;
    const end = start + limit;

    // who you follow (to boost/prioritize)
    const me = await User.findById(req.user._id).select("following");
    const followingSet = new Set(
      (me?.following || []).map((id) => id.toString())
    );

    // POSTS: populate user + comment users (old shape), keep likes as ids
    const posts = await Post.find()
      .populate("userId", "username profilePic")
      .populate("comments.userId", "username profilePic")
      .lean();

    // REELS: same populate; normalize to post shape (video, comments)
    const reelsRaw = await Reel.find()
      .populate("userId", "username profilePic")
      .populate("comments.userId", "username profilePic")
      .lean();

    const reels = reelsRaw.map((r) => ({
      _id: r._id,
      userId: r.userId,  // populated
      type: "reel",
      text: "",
      caption: r.caption || "",
      images: [],
      video: r.videoUrl || "",
      likes: r.likes || [], // ids
      comments: (r.comments || []).map((c) => ({
        userId: c.userId, // populated
        comment: c.text,
        createdAt: c.createdAt,
      })),
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));

    const combined = [
      ...posts.map((p) => ({
        _id: p._id,
        userId: p.userId, // populated
        type: p.type || "post",
        text: p.text || "",
        caption: p.caption || "",
        images: Array.isArray(p.images) ? p.images : [],
        video: p.video || "",
        likes: p.likes || [], // ids
        comments: (p.comments || []).map((c) => ({
          userId: c.userId, // populated
          comment: c.comment,
          createdAt: c.createdAt,
        })),
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      })),
      ...reels,
    ];

    // score: recency + engagement + followed boost + jitter
    const scored = combined.map((item) => {
      const authorId =
        item.userId?._id?.toString?.() || item.userId?.toString?.() || "";
      const ageHours =
        (Date.now() - new Date(item.createdAt).getTime()) / 3600000;
      const recency = timeDecay(ageHours); // 0..1
      const engagement =
        Math.min((item.likes?.length || 0) / 50, 1) * 0.5 +
        Math.min((item.comments?.length || 0) / 20, 1) * 0.8;
      const followBoost = followingSet.has(authorId) ? 0.9 : 0; // big push
      const rand = jitter(shuffleSeed, item._id.toString(), 0.12);
      return { ...item, __score: recency * 0.5 + engagement * 0.3 + followBoost + rand };
    });

    // sort by score
    scored.sort((a, b) => b.__score - a.__score);

    // ensure followed items are at the very start (after scoring)
    const followed = [];
    const others = [];
    for (const it of scored) {
      const authorId =
        it.userId?._id?.toString?.() || it.userId?.toString?.() || "";
      (followingSet.has(authorId) ? followed : others).push(it);
    }
    const ordered = [...followed, ...others].map(({ __score, ...rest }) => rest);

    // paginate
    const slice = ordered.slice(start, end);

    // send pagination in headers; BODY is ARRAY
    res.set({
      "X-Feed-Page": String(page),
      "X-Feed-Limit": String(limit),
      "X-Feed-Total": String(ordered.length),
      "X-Feed-Has-Next": String(end < ordered.length),
      "X-Feed-Seed": shuffleSeed,
    });

    return res.json(slice);
  } catch (err) {
    console.error("getAllPosts feed error:", err);
    res.status(500).json({ message: err.message });
  }
};

/* ============== profile feed (kept same as before, newest first) ============== */
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

    const posts = await Post.find({ userId })
      .populate("userId", "username profilePic")
      .populate("comments.userId", "username profilePic")
      .lean();

    const reelsRaw = await Reel.find({ userId })
      .populate("userId", "username profilePic")
      .populate("comments.userId", "username profilePic")
      .lean();

    const reels = reelsRaw.map((r) => ({
      _id: r._id,
      userId: r.userId,
      type: "reel",
      text: "",
      caption: r.caption || "",
      images: [],
      video: r.videoUrl || "",
      likes: r.likes || [],
      comments: (r.comments || []).map((c) => ({
        userId: c.userId,
        comment: c.text,
        createdAt: c.createdAt,
      })),
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));

    const combined = [
      ...posts.map((p) => ({
        _id: p._id,
        userId: p.userId,
        type: p.type || "post",
        text: p.text || "",
        caption: p.caption || "",
        images: Array.isArray(p.images) ? p.images : [],
        video: p.video || "",
        likes: p.likes || [],
        comments: (p.comments || []).map((c) => ({
          userId: c.userId,
          comment: c.comment,
          createdAt: c.createdAt,
        })),
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      })),
      ...reels,
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

/* ---------------- the rest of your controller (like/unlike/comment/etc.) ---------------- */
/* unchanged from your working version; keep as-is */
