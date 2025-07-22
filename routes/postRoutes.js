// routes/postRoutes.js

const express = require("express");
const router = express.Router();

// ✅ Controller functions
const {
  createPost,
  getAllPosts,
  likePost,
  unlikePost,
  commentPost,
} = require("../controllers/postController");

// ✅ Auth middleware (Protect all routes)
const auth = require("../middleware/auth");

// ─── ROUTES ───────────────────────────────────────────────

// 📤 Create a new post
router.post("/", auth, createPost);

// 📥 Get all posts
router.get("/", auth, getAllPosts);

// 👍 Like a post
router.put("/like/:id", auth, likePost);

// 👎 Unlike a post
router.put("/unlike/:id", auth, unlikePost);

// 💬 Add a comment to a post
router.post("/comment/:id", auth, commentPost);

// ─────────────────────────────────────────────────────────

module.exports = router;
