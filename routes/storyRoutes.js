const express = require("express");
const router = express.Router();

// ✅ Controllers
const {
  uploadStory,
  getAllStories,
  viewStory,
  deleteStory,
} = require("../controllers/storyController");

// ✅ Middlewares
const auth = require("../middleware/auth");         // 🔐 JWT Auth Middleware
const upload = require("../middleware/multer");     // ☁️ Multer + Cloudinary setup

// ──────────────────────────────
// 📤 Upload Story (POST)
// URL: /api/story/upload
// Auth: ✅ Required
// Body: form-data { story: File, caption: Text }
// ──────────────────────────────
router.post("/upload", auth, upload.single("story"), uploadStory);

// ──────────────────────────────
// 📥 Get All Stories (GET)
// URL: /api/story/all
// Auth: ✅ Required
// Info: Expired stories auto-deleted via TTL in schema
// ──────────────────────────────
router.get("/all", auth, getAllStories);

// ──────────────────────────────
// 👁️ Mark Story as Viewed (PUT)
// URL: /api/story/view/:id
// Auth: ✅ Required
// Info: Adds userId to story.views[]
// ──────────────────────────────
router.put("/view/:id", auth, viewStory);

// ──────────────────────────────
// ❌ Delete Story (DELETE)
// URL: /api/story/delete/:id
// Auth: ✅ Required (only owner)
// ──────────────────────────────
router.delete("/delete/:id", auth, deleteStory);

// ✅ Export Router
module.exports = router;
