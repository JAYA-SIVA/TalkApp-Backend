// routes/reelRoutes.js
const express = require("express");
const router = express.Router();

// ✅ Controllers
const {
  uploadReel,
  getAllReels,
  getReelById,
  getReelComments,
  likeReel,
  dislikeReel,
  commentReel,
  deleteReel,
} = require("../controllers/reels");

// 🔐 Auth middleware (keep this consistent across your app)
const auth = require("../middleware/auth");

// 📦 Multer (Cloudinary) middleware
const upload = require("../middleware/multer");

/* ─────────────────────────────────────────
   REELS ROUTES  (mounted under /api/reels)
   ───────────────────────────────────────── */

// 🎥 Upload a new reel (multipart: field name "reel", plus "caption")
router.post("/upload", auth, upload.single("reel"), uploadReel);

// 📥 Get all reels (public)
router.get("/", getAllReels);

// 💬 Get comments of a reel (public or protect if you prefer)
router.get("/comments/:id", getReelComments);

// 🆔 Get single reel (public)
router.get("/:id", getReelById);

// 👍 Like a reel
router.put("/like/:id", auth, likeReel);

// 👎 Unlike a reel
router.put("/dislike/:id", auth, dislikeReel);

// 💬 Comment on a reel
router.post("/comment/:id", auth, commentReel);

// ❌ Delete a reel (owner only)
router.delete("/:id", auth, deleteReel);

module.exports = router;
