const express = require("express");
const router = express.Router();

const {
  uploadReel,
  getAllReels,
  likeReel,
  dislikeReel,
  commentReel,
  deleteReel
} = require("../controllers/reelController");

// 🔐 Middleware to authenticate user
const authenticate = require("../middleware/authMiddleware");

// 📤 Middleware for handling video uploads (Cloudinary via multer)
const upload = require("../middleware/multer");

// ──────────────────────────────
// ✅ REEL ROUTES
// ──────────────────────────────

// 🎥 Upload a new reel
// POST /api/reels/upload
router.post("/upload", authenticate, upload.single("reel"), uploadReel);

// 📥 Get all reels
// GET /api/reels
router.get("/", getAllReels); // ✅ Make sure this matches app.js usage

// 👍 Like a reel
// PUT /api/reels/like/:id
router.put("/like/:id", authenticate, likeReel);

// 👎 Dislike a reel
// PUT /api/reels/dislike/:id
router.put("/dislike/:id", authenticate, dislikeReel);

// 💬 Comment on a reel
// POST /api/reels/comment/:id
router.post("/comment/:id", authenticate, commentReel);

// ❌ Delete a reel
// DELETE /api/reels/:id
router.delete("/:id", authenticate, deleteReel);

module.exports = router;
