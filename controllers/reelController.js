// controllers/reels.js
const mongoose = require("mongoose");
const cloudinary = require("../config/cloudinary");
const Reel = require("../models/reel");
const User = require("../models/User");
const createNotification = require("../utils/createNotification");
const crypto = require("crypto");

/* ─────────────────────────────────────────
   Constants & helpers (paging/scoring)
   ───────────────────────────────────────── */
const MAX_LIMIT = 300;
const DEFAULT_LIMIT = 300;          // bumped from 50 → 300
const FETCH_POOL_MULTIPLIER = 2;    // fetch 2x page size, then score & slice

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

function clampLimit(raw) {
  const n = Number(raw) || DEFAULT_LIMIT;
  return Math.min(Math.max(n, 1), MAX_LIMIT);
}
function parsePage(raw) {
  const p = Number(raw) || 1;
  return Math.max(p, 1);
}
function timeDecay(ageHours, tau = 20) {
  return Math.exp(-ageHours / tau);
}
function jitter(seed, itemId, delta = 0.45) {
  const h = crypto.createHash("sha1").update(`${seed}|${itemId}`).digest("hex");
  const u = parseInt(h.slice(0, 8), 16) / 0xffffffff;
  return (u * 2 - 1) * delta; // [-delta, +delta]
}

function extractCloudinaryPublicId(url = "") {
  // Works for: https://res.cloudinary.com/<cloud>/video/upload/v169/.../reels/abc123.mp4
  // Returns: "reels/abc123"
  try {
    const parts = url.split("/upload/");
    if (parts.length < 2) return null;
    const tail = parts[1];
    const noQuery = tail.split("?")[0];
    const noExt = noQuery.replace(/\.[^/.]+$/, "");
    return noExt.replace(/^v\d+\//, "");
  } catch {
    return null;
  }
}

async function freshReel(reelId) {
  return Reel.findById(reelId)
    .populate("userId", "username profilePic")
    .populate("comments.user", "username profilePic")
    .populate("likes", "username profilePic");
}

function sendReel(res, reel, okMsg = "OK") {
  if (!reel) return res.status(404).json({ success: false, message: "Reel not found" });
  return res.json({
    success: true,
    message: okMsg,
    reel,
    likesCount: reel.likes?.length || 0,
    commentsCount: reel.comments?.length || 0,
  });
}

/* ─────────────────────────────────────────
   ✅ Upload a new reel (multipart form: {file, caption})
   Protected
   ───────────────────────────────────────── */
exports.uploadReel = async (req, res) => {
  try {
    if (!req.file || !req.body.caption) {
      return res.status(400).json({ message: "Video file and caption are required" });
    }

    const cld = await cloudinary.uploader.upload(req.file.path, {
      resource_type: "video",
      folder: "reels",
    });

    const userId = (req.user && (req.user._id || req.user.id)) || req.body.userid;
    if (!isValidId(userId)) return res.status(401).json({ message: "Unauthorized" });

    const reel = await Reel.create({
      userId,
      videoUrl: cld.secure_url,
      videoPublicId: cld.public_id, // e.g. "reels/abc123"
      caption: req.body.caption,
    });

    const populated = await freshReel(reel._id);
    return sendReel(res, populated, "Reel uploaded successfully");
  } catch (err) {
    console.error("Upload Error:", err);
    res.status(500).json({ message: err.message || "Server error" });
  }
};

/* ─────────────────────────────────────────
   ✅ Reels FEED (paged, scored, shuffled by seed)
   Public or Protected (works either way; follow-boost if authed)
   Query: ?page=1&limit=300&seed=123
   ───────────────────────────────────────── */
exports.getReelsFeed = async (req, res) => {
  try {
    const viewerId = req.user?._id?.toString() || "";
    const shuffleSeed = req.query.seed || Date.now().toString();

    const page = parsePage(req.query.page);
    const limit = clampLimit(req.query.limit);
    const start = (page - 1) * limit;
    const end = start + limit;

    // soft boost for accounts the viewer follows (if logged in)
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
      .populate("comments.user", "username profilePic")
      .lean();

    const items = reelsRaw.map((r) => ({
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
        user: c.user, // populated
        text: c.text,
        createdAt: c.createdAt,
      })),
      commentsCount: (r.comments || []).length,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));

    const scored = items.map((item) => {
      const authorId =
        item.userId?._id?.toString?.() || item.userId?.toString?.() || "";
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

/* ─────────────────────────────────────────
   ✅ Get all reels (simple, paged list — newest first)
   Public
   Query: ?page=1&limit=300
   ───────────────────────────────────────── */
exports.getAllReels = async (req, res) => {
  try {
    const page = parsePage(req.query.page);
    const limit = clampLimit(req.query.limit);
    const start = (page - 1) * limit;
    const end = start + limit;

    // pull a pool so we can compute counts before slicing
    const poolSize = limit * FETCH_POOL_MULTIPLIER;

    const reels = await Reel.find()
      .sort({ createdAt: -1 })
      .limit(poolSize)
      .populate("userId", "username profilePic")
      .populate("comments.user", "username profilePic");

    const mapped = reels.map((r) => {
      const obj = r.toObject();
      return {
        ...obj,
        commentsCount: r.comments?.length || 0,
        likesCount: r.likes?.length || 0,
      };
    });

    const slice = mapped.slice(start, end);

    res.set({
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      "Pragma": "no-cache",
      "Expires": "0",
      "Surrogate-Control": "no-store",
      "X-Feed-Page": String(page),
      "X-Feed-Limit": String(limit),
      "X-Feed-Total": String(mapped.length),
      "X-Feed-Has-Next": String(end < mapped.length),
    });

    res.status(200).json(slice);
  } catch (err) {
    console.error("getAllReels error:", err);
    res.status(500).json({ message: err.message });
  }
};

/* ─────────────────────────────────────────
   ✅ Get single reel by id
   Public
   ───────────────────────────────────────── */
exports.getReelById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ message: "Invalid Reel ID" });
    const reel = await freshReel(id);
    return sendReel(res, reel);
  } catch (err) {
    console.error("getReelById error:", err);
    res.status(500).json({ message: err.message });
  }
};

/* ─────────────────────────────────────────
   ✅ Like a reel (idempotent + notification)
   Protected
   ───────────────────────────────────────── */
exports.likeReel = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ message: "Invalid Reel ID" });

    const actorId = (req.user?._id || req.user?.id)?.toString();
    if (!actorId) return res.status(401).json({ message: "Unauthorized" });

    await Reel.findByIdAndUpdate(
      id,
      { $addToSet: { likes: new mongoose.Types.ObjectId(actorId) } },
      { new: true }
    );

    const reel = await Reel.findById(id);
    if (!reel) return res.status(404).json({ message: "Reel not found" });

    // 🔔 Notify owner
    if (reel.userId.toString() !== actorId) {
      const actor = await User.findById(actorId).select("username");
      await createNotification({
        userId: reel.userId.toString(),
        fromUserId: actorId,
        type: "like",
        postId: reel._id.toString(), // reuse postId slot
        message: `${actor?.username || "Someone"} liked your reel`,
      });
    }

    const populated = await freshReel(id);
    return sendReel(res, populated, "Reel liked");
  } catch (err) {
    console.error("likeReel error:", err);
    res.status(500).json({ message: err.message });
  }
};

/* ─────────────────────────────────────────
   ✅ Dislike (Unlike) a reel
   Protected
   ───────────────────────────────────────── */
exports.dislikeReel = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ message: "Invalid Reel ID" });

    const actorId = (req.user?._id || req.user?.id)?.toString();
    if (!actorId) return res.status(401).json({ message: "Unauthorized" });

    await Reel.findByIdAndUpdate(
      id,
      { $pull: { likes: new mongoose.Types.ObjectId(actorId) } },
      { new: true }
    );

    const populated = await freshReel(id);
    return sendReel(res, populated, "Reel unliked");
  } catch (err) {
    console.error("dislikeReel error:", err);
    res.status(500).json({ message: err.message });
  }
};

/* ─────────────────────────────────────────
   ✅ Comment on a reel (+ notification)
   Body: { text }
   Protected
   ───────────────────────────────────────── */
exports.commentReel = async (req, res) => {
  try {
    const { id } = req.params;
    const text = (req.body?.text || "").trim();
    if (!isValidId(id)) return res.status(400).json({ message: "Invalid Reel ID" });
    if (!text) return res.status(400).json({ message: "Comment text is required" });

    const actorId = (req.user?._id || req.user?.id)?.toString();
    if (!actorId) return res.status(401).json({ message: "Unauthorized" });

    await Reel.findByIdAndUpdate(
      id,
      {
        $push: {
          comments: {
            user: new mongoose.Types.ObjectId(actorId),
            text,
            createdAt: new Date(),
          },
        },
      },
      { new: true }
    );

    const reel = await Reel.findById(id);
    if (!reel) return res.status(404).json({ message: "Reel not found" });

    // 🔔 Notify owner
    if (reel.userId.toString() !== actorId) {
      const actor = await User.findById(actorId).select("username");
      await createNotification({
        userId: reel.userId.toString(),
        fromUserId: actorId,
        type: "comment",
        postId: reel._id.toString(),
        message: `${actor?.username || "Someone"} commented on your reel`,
      });
    }

    const populated = await freshReel(id);
    return sendReel(res, populated, "Comment added");
  } catch (err) {
    console.error("commentReel error:", err);
    res.status(500).json({ message: err.message });
  }
};

/* ─────────────────────────────────────────
   ✅ Get reel comments (paged in DB optional later)
   Public/Protected
   ───────────────────────────────────────── */
exports.getReelComments = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ message: "Invalid Reel ID" });

    const reel = await Reel.findById(id).populate("comments.user", "username profilePic");
    if (!reel) return res.status(404).json({ message: "Reel not found" });

    res.json(reel.comments || []);
  } catch (err) {
    console.error("getReelComments error:", err);
    res.status(500).json({ message: err.message });
  }
};

/* ─────────────────────────────────────────
   ✅ Delete a reel (with Cloudinary cleanup)
   Protected (owner only)
   ───────────────────────────────────────── */
exports.deleteReel = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ message: "Invalid Reel ID" });

    const me = (req.user?._id || req.user?.id)?.toString();
    const reel = await Reel.findById(id);
    if (!reel) return res.status(404).json({ message: "Reel not found" });
    if (reel.userId.toString() !== me) return res.status(403).json({ message: "Unauthorized" });

    const publicId = reel.videoPublicId || extractCloudinaryPublicId(reel.videoUrl) || null;

    if (publicId) {
      try {
        await cloudinary.uploader.destroy(publicId, { resource_type: "video" });
      } catch (e) {
        console.warn("Cloudinary destroy warning:", e.message);
      }
    }

    await Reel.findByIdAndDelete(id);
    res.status(200).json({ message: "Reel deleted successfully" });
  } catch (err) {
    console.error("deleteReel error:", err);
    res.status(500).json({ message: err.message });
  }
};
