// routes/talk.js

const express = require("express");
const router = express.Router();

// ✅ Middleware for Cloudinary Upload & JWT Auth
const upload = require("../middleware/multer");
const auth = require("../middleware/auth");

// ✅ Controller functions
const {
  uploadPost,
  getAllPosts,
  getPostsByUser,
  getPostById,
  getPostsByUsername,
  likePost,
  unlikePost,
  addComment,
  getComments,
  deletePost
} = require("../controllers/talk");

// 📤 Upload a new post with media (image/video)
router.post("/upload", auth, upload.single("media"), uploadPost);

// 📥 Get all posts (Home feed)
router.get("/all", getAllPosts);

// 👤 Get all posts by user ID
router.get("/user/:id", getPostsByUser);

// 🆔 Get a post by Post ID
router.get("/post/:id", getPostById);

// 🔍 Get posts by Username
router.get("/by-username/:username", getPostsByUsername);

// 👍 Like a post
router.put("/like/:id", auth, likePost);

// 👎 Unlike a post
router.put("/unlike/:id", auth, unlikePost);

// 💬 Add comment to a post
router.post("/comment/:id", auth, addComment);

// 🗨️ Get all comments of a post
router.get("/comments/:id", getComments);

// ❌ Delete a post by ID
router.delete("/delete/:id", auth, deletePost);

// 🏠 Authenticated Home Feed (used in Android)
router.get("/", auth, getAllPosts);


module.exports = router;
