// routes/postRoutes.js
const express = require("express");
const router = express.Router();

// ✅ Controller functions
const {
  createPost,
  getAllPosts,
  getPostById,
  getPostsByUser,
  likePost,
  unlikePost,
  commentPost,
  getComments,
  deletePost,
} = require("../controllers/postController");

// ✅ Auth middleware (protect routes)
const auth = require("../middleware/auth");

/* ─────────────────────────────────────────
   POSTS ROUTES (mounted under /api/posts)
   ───────────────────────────────────────── */

// 📤 Create a new post
router.post("/", auth, createPost);

// 📥 Get all posts
router.get("/", auth, getAllPosts);

// 👤 Get posts by a specific user
router.get("/user/:userId", auth, getPostsByUser);

// 💬 Get comments for a post
router.get("/comments/:id", auth, getComments);

// 👍 Like a post
router.put("/like/:id", auth, likePost);

// 👎 Unlike a post
router.put("/unlike/:id", auth, unlikePost);

// 💬 Add a comment to a post
router.post("/comment/:id", auth, commentPost);

// 🆔 Get a single post by ID
router.get("/:id", auth, getPostById);

// ❌ Delete a post (owner only)
router.delete("/:id", auth, deletePost);

module.exports = router;
