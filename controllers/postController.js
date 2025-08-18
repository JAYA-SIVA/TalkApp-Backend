const mongoose = require("mongoose");
const Post = require("../models/Post");
const User = require("../models/User");
const cloudinary = require("../config/cloudinary");
const createNotification = require("../utils/createNotification"); // 🔔 helper
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

    const populated = await Post.findById(post._id)
      .populate("userId", "username profilePic")
      .populate("comments.userId", "username profilePic")
      .populate("likes", "username profilePic");

    res.status(201).json(populated || post);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ----------------------------- Shuffle Helpers ---------------------------- */
function timeDecay(ageHours, tau = 20) {
  return Math.exp(-ageHours / tau); // 0..1
}

function jitter(userId, postId, bucketISO, delta = 0.05) {
  const h = crypto
    .createHash("sha1")
    .update(`${userId}|${postId}|${bucketISO}`)
    .digest("hex");
  const u = parseInt(h.slice(0, 8), 16) / 0xffffffff;
  return (u * 2 - 1) * delta; // [-delta, +delta]
}

/* -------------------------------- Get all -------------------------------- */
exports.getAllPosts = async (req, res) => {
  try {
    const userId = req.user?._id?.toString() || "anon";

    // Bucket = reshuffle every 3h
    const bucketMs = 3 * 3600 * 1000;
    const bucketISO = new Date(
      Math.floor(Date.now() / bucketMs) * bucketMs
    ).toISOString();

    // Load recent posts (limit for performance)
    const posts = await Post.find()
      .populate("userId", "username profilePic")
      .populate("comments.userId", "username profilePic")
      .lean();

    const scored = posts.map((p) => {
      const ageHours =
        (Date.now() - new Date(p.createdAt).getTime()) / 3600000;

      const recency = timeDecay(ageHours);
      const quality =
        Math.min((p.likes?.length || 0) / 50, 1) * 0.5 +
        Math.min((p.comments?.length || 0) / 20, 1) * 0.8;

      const base = recency * 0.6 + quality * 0.4;
      const jit = jitter(userId, p._id.toString(), bucketISO);

      return { ...p, baseScore: base + jit };
    });

    // Sort by score
    scored.sort((a, b) => b.baseScore - a.baseScore);

    // Diversify (max 2 posts per author per page)
    const cap = new Map();
    const diversified = [];
    for (const item of scored) {
      const a = item.userId?._id?.toString() || "unknown";
      const c = cap.get(a) || 0;
      if (c < 2) {
        diversified.push(item);
        cap.set(a, c + 1);
      }
    }

    res.json(diversified);
  } catch (err) {
    console.error("feed error", err);
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
      const updated = await Post.findById(postId).populate(
        "likes",
        "username profilePic"
      );
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
      } catch (e) {
        console.error("notify like:", e.message);
      }
    }

    const updated = await Post.findById(postId).populate(
      "likes",
      "username profilePic"
    );
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

    post.likes = (post.likes || []).filter(
      (id) => id.toString() !== actorId
    );
    await post.save();

    const updated = await Post.findById(postId).populate(
      "likes",
      "username profilePic"
    );
    res.json({ message: "Post unliked", likes: updated.likes });
  } catch (err) {
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
      } catch (e) {
        console.error("notify comment:", e.message);
      }
    }

    const updated = await Post.findById(postId).populate(
      "comments.userId",
      "username profilePic"
    );
    res
      .status(201)
      .json({ message: "Comment added", comments: updated.comments });
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
      return res
        .status(403)
        .json({ message: "Unauthorized to delete this post" });
    }

    if (post.images && post.images.length > 0) {
      for (let imageUrl of post.images) {
        const publicId = imageUrl.split("/").pop().split(".")[0];
        try {
          await cloudinary.uploader.destroy(`posts/${publicId}`, {
            resource_type: "image",
          });
        } catch (e) {
          console.warn(
            "cloudinary image destroy failed:",
            publicId,
            e.message
          );
        }
      }
    }

    if (post.video) {
      const publicId = post.video.split("/").pop().split(".")[0];
      try {
        await cloudinary.uploader.destroy(`posts/${publicId}`, {
          resource_type: "video",
        });
      } catch (e) {
        console.warn(
          "cloudinary video destroy failed:",
          publicId,
          e.message
        );
      }
    }

    await Post.findByIdAndDelete(req.params.id);
    res.status(200).json({ message: "Post deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ------------------------------- Aliases --------------------------------- */
exports.addComment = exports.commentPost;
