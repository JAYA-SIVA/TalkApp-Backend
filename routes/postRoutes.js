// routes/postRoutes.js
const express = require("express");
const router = express.Router();

// Import the whole controller as an object (prevents undefined callbacks)
const postCtrl = require("../controllers/postController");

// Auth middleware (protect routes)
const auth = require("../middleware/auth");

// ---- Sanity checks (helpful in deploy logs) ----
const requiredFns = [
  "createPost",
  "getAllPosts",
  "getReelsFeed",   // <-- new reels feed handler
  "getPostById",
  "getPostsByUser",
  "likePost",
  "unlikePost",
  "commentPost",
  "getComments",
  "deletePost",
];

requiredFns.forEach((fn) => {
  if (typeof postCtrl[fn] !== "function") {
    console.error(`[postRoutes] Missing controller function: ${fn}`);
  }
});

if (typeof auth !== "function") {
  console.error("[postRoutes] Missing auth middleware — check ../middleware/auth export/path");
}

/* ─────────────────────────────────────────
   POSTS ROUTES (mounted under /api/posts)
   ───────────────────────────────────────── */

// 📤 Create a new post
router.post("/", auth, postCtrl.createPost);

// 🏠 Global feed (merged posts+reels, shuffled each request, ARRAY body)
router.get("/", auth, postCtrl.getAllPosts);

// 🎬 Reels-only feed (shuffled each request, ARRAY body)
router.get("/reels", auth, postCtrl.getReelsFeed);

// 👤 Profile feed (user’s posts+reels, ARRAY body)
router.get("/user/:userId", auth, postCtrl.getPostsByUser);

// 💬 Get comments for a post
router.get("/comments/:id", auth, postCtrl.getComments);

// 👍 Like a post
router.put("/like/:id", auth, postCtrl.likePost);

// 👎 Unlike a post
router.put("/unlike/:id", auth, postCtrl.unlikePost);

// 💬 Add a comment to a post
router.post("/comment/:id", auth, postCtrl.commentPost);

// 🆔 Get a single post by ID (detail screen)
router.get("/:id", auth, postCtrl.getPostById);

// ❌ Delete a post (owner only)
router.delete("/:id", auth, postCtrl.deletePost);

module.exports = router;
