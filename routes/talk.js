// routes/talk.js
const express = require("express");
const router = express.Router();

// 🔐 Middleware
const auth = require("../middleware/auth");          // JWT guard
const upload = require("../middleware/multer");      // Multer (Cloudinary adapter)

// 🎮 Controllers (keep the file name you already use)
const {
  // Create / Upload
  uploadPost,                // expects multipart field: "media"
  // Feed
  getAllPosts,               // GET /all and GET /
  getPostById,               // GET /post/:id
  getPostsByUser,            // GET /user/:id
  getPostsByUsername,        // GET /by-username/:username
  // Reels
  getReels,                  // GET /reels
  // Reactions
  likePost,                  // PUT /like/:id
  unlikePost,                // PUT /unlike/:id
  // Comments
  addComment,                // POST /comment/:id   body: { comment: "..." }
  getComments,               // GET /comments/:id
  // Delete
  deletePost,                // DELETE /delete/:id
} = require("../controllers/talk");

// ─────────────────────────────
// 📤 Upload a post (image/video)
// Multipart: field name must be "media"
// ─────────────────────────────
router.post("/upload", auth, upload.single("media"), uploadPost);

// ─────────────────────────────
// 📰 Feeds
// ─────────────────────────────
router.get("/all", getAllPosts);     // public feed (optional)
router.get("/", auth, getAllPosts);  // authed feed

// ─────────────────────────────
// 🎬 Reels (video-type posts)
// ─────────────────────────────
router.get("/reels", getReels);

// ─────────────────────────────
// 🔍 Fetch posts
// ─────────────────────────────
router.get("/post/:id", getPostById);                     // by post id
router.get("/user/:id", auth, getPostsByUser);            // by user id
router.get("/by-username/:username", getPostsByUsername); // by username

// ─────────────────────────────
// ❤️ Likes
// ─────────────────────────────
router.put("/like/:id", auth, likePost);
router.put("/unlike/:id", auth, unlikePost);

// ─────────────────────────────
// 💬 Comments
// body: { comment: "text" }
// ─────────────────────────────
router.post("/comment/:id", auth, addComment);
router.get("/comments/:id", getComments);

// ─────────────────────────────
// ❌ Delete
// ─────────────────────────────
router.delete("/delete/:id", auth, deletePost);

module.exports = router;
