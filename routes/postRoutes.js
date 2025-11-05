// routes/postRoutes.js
const express = require("express");
const router = express.Router();

const postCtrl = require("../controllers/postController");
const auth = require("../middleware/auth");
const Post = require("../models/Post"); // for isAdultish()

/* ---- Sanity checks (useful in logs) ---- */
[
  "createPost",
  "getAllPosts",
  "getReelsFeed",
  "getPostById",
  "getPostsByUser",
  "likePost",
  "unlikePost",
  "commentPost",
  "getComments",
  "deletePost",
  "incrementPostView", // 👁️ make sure controller has this
].forEach((fn) => {
  if (typeof postCtrl[fn] !== "function") {
    console.error(`[postRoutes] Missing controller function: ${fn}`);
  }
});

if (typeof auth !== "function") {
  console.error("[postRoutes] Missing auth middleware — check ../middleware/auth export/path");
}

/* ------------------------------------------------------------------ */
/*                        Upload safety middlewares                    */
/* ------------------------------------------------------------------ */

// Strip any client attempts to set moderation fields
function stripClientModerationFields(req, _res, next) {
  if (req.body) {
    delete req.body.isAdult;
    delete req.body.isApproved;
    delete req.body.moderation;
  }
  next();
}

// Block adult/explicit uploads at create time (caption/text keywords)
function rejectAdultUploads(req, res, next) {
  const candidate = `${req.body?.caption || ""} ${req.body?.text || ""}`.trim();
  if (Post.isAdultish(candidate)) {
    return res.status(400).json({ error: "Adult/explicit content is not allowed." });
  }
  next();
}

/* ─────────────────────────────────────────
   POSTS ROUTES (mounted under /api/posts)
   ───────────────────────────────────────── */

// Create a new post
router.post("/", auth, stripClientModerationFields, rejectAdultUploads, postCtrl.createPost);

// Global feed (posts + reels, ARRAY body, shuffled each request)
router.get("/", auth, postCtrl.getAllPosts);

// Reels-only feed (ARRAY body, shuffled)
router.get("/reels", auth, postCtrl.getReelsFeed);

// Profile feed (user’s posts + reels)
router.get("/user/:userId", auth, postCtrl.getPostsByUser);

// Get comments for a post
router.get("/comments/:id", auth, postCtrl.getComments);

// Like / Unlike
router.put("/like/:id", auth, postCtrl.likePost);
router.put("/unlike/:id", auth, postCtrl.unlikePost);

// Comment
router.post("/comment/:id", auth, postCtrl.commentPost);

// 👁️ Increment post view count (call when media becomes visible/starts)
router.post("/:id/view", auth, postCtrl.incrementPostView);

// Single post by ID
router.get("/:id", auth, postCtrl.getPostById);

// Delete post (owner only)
router.delete("/:id", auth, postCtrl.deletePost);

module.exports = router;
