const express = require("express");
const router = express.Router();

// ✅ Middleware
const upload = require("../middleware/multer"); // Cloudinary + Multer
const auth = require("../middleware/auth");     // JWT Token protection

// ✅ Controllers
const {
  uploadPost,
  getAllPosts,
  getPostById,
  getPostsByUser,
  getPostsByUsername,
  likePost,
  unlikePost,
  addComment,
  getComments,
  deletePost,
  getReels, // ✅ NEW: Get reels/videos for Reels Page
} = require("../controllers/talk");

// ─────────────────────────────
// 📤 Upload a post (image or video)
// ─────────────────────────────
router.post("/upload", auth, upload.single("media"), uploadPost);

// ─────────────────────────────
// 📥 Get all posts (Home Feed)
// ─────────────────────────────
router.get("/all", getAllPosts);         // Open feed
router.get("/", auth, getAllPosts);      // Authenticated feed

// ─────────────────────────────
// 📽️ Get reels (videos + reel type posts) — For Reels Page
// ─────────────────────────────
router.get("/reels", getReels); // ✅ This is the NEW route

// ─────────────────────────────
// 🔍 Fetch posts
// ─────────────────────────────
router.get("/post/:id", getPostById);                     // By Post ID
router.get("/user/:id", getPostsByUser);                  // By User ID
router.get("/by-username/:username", getPostsByUsername); // By Username

// ─────────────────────────────
// ❤️ Likes
// ─────────────────────────────
router.put("/like/:id", auth, likePost);
router.put("/unlike/:id", auth, unlikePost);

// ─────────────────────────────
// 💬 Comments
// ─────────────────────────────
router.post("/comment/:id", auth, addComment);
router.get("/comments/:id", getComments);

// ─────────────────────────────
// ❌ Delete
// ─────────────────────────────
router.delete("/delete/:id", auth, deletePost);

module.exports = router;
