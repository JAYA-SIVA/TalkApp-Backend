// controllers/reels.js
const mongoose = require("mongoose");
const cloudinary = require("../config/cloudinary");
const Reel = require("../models/reel");
const User = require("../models/User");
const Notification = require("../models/Notification");

/* ─────────────────────────────────────────
   🔔 Inline Notification helper
   ───────────────────────────────────────── */
async function createNotification({ userId, fromUserId, type, postId = null, message = "" }) {
  try {
    if (!userId || !fromUserId || !type) return;
    if (String(userId) === String(fromUserId)) return;

    const n = await Notification.create({
      userId,
      fromUserId,
      type,          // "like" | "comment" | "follow" | "message"
      postId,        // we store reel _id in postId for consistency
      message,
      seen: false,
    });

    // Realtime ping (optional)
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
    console.error("reels notify error:", e.message);
  }
}

/* ─────────────────────────────────────────
   Helpers
   ───────────────────────────────────────── */
const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

function extractCloudinaryPublicId(url = "") {
  // Works for: https://res.cloudinary.com/<cloud>/video/upload/v169/.../reels/abc123.mp4
  // Returns: "reels/abc123"
  try {
    const parts = url.split("/upload/");
    if (parts.length < 2) return null;
    const tail = parts[1];                // v169/.../reels/abc123.mp4
    const noQuery = tail.split("?")[0];   // remove any query
    const noExt = noQuery.replace(/\.[^/.]+$/, ""); // drop extension
    // drop the version bit (e.g. v169/)
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
   ✅ Upload a new reel
   Body: multipart/form-data { file: video, caption }
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
      // If your schema has this field, great; if not, ignore (safe delete fallback below)
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
   ✅ Get all reels (with counts)
   Public
   ───────────────────────────────────────── */
exports.getAllReels = async (_req, res) => {
  try {
    const reels = await Reel.find()
      .sort({ createdAt: -1 })
      .populate("userId", "username profilePic")
      .populate("comments.user", "username profilePic")
      .populate("likes", "username profilePic");

    const mapped = reels.map((r) => ({
      ...r.toObject(),
      commentsCount: r.comments?.length || 0,
      likesCount: r.likes?.length || 0,
    }));

    res.status(200).json(mapped);
  } catch (err) {
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
        postId: reel._id.toString(),
        message: `${actor?.username || "Someone"} liked your reel`,
      });
    }

    const populated = await freshReel(id);
    return sendReel(res, populated, "Reel liked");
  } catch (err) {
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
    res.status(500).json({ message: err.message });
  }
};

/* ─────────────────────────────────────────
   ✅ Get reel comments
   Protected (optional)
   ───────────────────────────────────────── */
exports.getReelComments = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ message: "Invalid Reel ID" });

    const reel = await Reel.findById(id).populate("comments.user", "username profilePic");
    if (!reel) return res.status(404).json({ message: "Reel not found" });

    res.json(reel.comments || []);
  } catch (err) {
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

    // Try public_id from doc; else parse from URL
    const publicId =
      reel.videoPublicId || extractCloudinaryPublicId(reel.videoUrl) || null;

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
    res.status(500).json({ message: err.message });
  }
};
