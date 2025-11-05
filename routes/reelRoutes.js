// routes/reelRoutes.js
const express = require("express");
const router = express.Router();

// 🔐 Auth middleware
const auth = require("../middleware/auth");

// 📦 Multer (Cloudinary) middleware
const upload = require("../middleware/multer");

/* ─────────────────────────────────────────
   ✅ Flex-safe controller import
   Tries common filenames/casing so Render (Linux) won't 404
   ───────────────────────────────────────── */
let reels;
{
  const candidates = [
    "../controllers/reels",
    "../controllers/reelController",
    "../controllers/Reels",
    "../controllers/reel",
  ];
  for (const p of candidates) {
    try {
      // eslint-disable-next-line import/no-dynamic-require, global-require
      reels = require(p);
      break;
    } catch (_) {
      // keep trying next candidate
    }
  }
  if (!reels) {
    throw new Error(
      "Cannot load reels controller. Tried: ../controllers/reels, ../controllers/reelController, ../controllers/Reels, ../controllers/reel"
    );
  }
}

/* Destructure what we expect; keep the object too so we can conditionally mount */
const {
  uploadReel,
  getAllReels,
  getReelsFeed,        // 🔥 shuffled feed (if present in controller)
  getReelById,
  getReelComments,
  likeReel,
  dislikeReel,
  commentReel,
  deleteReel,
  incrementReelView,   // 👁️ optional view counter
} = reels;

/* ─────────────────────────────────────────
   Sanity logging (helpful in deploy logs)
   ───────────────────────────────────────── */
[
  "uploadReel",
  "getAllReels",
  "getReelsFeed",
  "getReelById",
  "getReelComments",
  "likeReel",
  "dislikeReel",
  "commentReel",
  "deleteReel",
  "incrementReelView",
].forEach((fn) => {
  if (typeof reels[fn] !== "function") {
    console.warn(`[reelRoutes] Controller function missing or not a function: ${fn}`);
  }
});

if (typeof auth !== "function") {
  console.error("[reelRoutes] Missing auth middleware — check ../middleware/auth export/path");
}

/* ─────────────────────────────────────────
   REELS ROUTES  (mounted under /api/reels)
   ───────────────────────────────────────── */

// 🎥 Upload a new reel (multipart: field name "reel", plus "caption")
router.post("/upload", auth, upload.single("reel"), uploadReel);

// 🧪 Shuffled reels feed (ARRAY body, scored + jitter) — if provided
if (typeof getReelsFeed === "function") {
  router.get("/feed", getReelsFeed); // public; will soft-boost follow if authed
}

// 📥 Get all reels (newest first, ARRAY body)
router.get("/", getAllReels);

// 💬 Get comments of a reel (public)
router.get("/comments/:id", getReelComments);

// 🆔 Get single reel (public)
router.get("/:id", getReelById);

// 👍 Like a reel
router.put("/like/:id", auth, likeReel);

// 👎 Unlike a reel
router.put("/dislike/:id", auth, dislikeReel);

// 💬 Comment on a reel
router.post("/comment/:id", auth, commentReel);

// 👁️ Increment reel view count (call when video starts playing / >1s visible)
if (typeof incrementReelView === "function") {
  router.post("/:id/view", auth, incrementReelView);
}

// ❌ Delete a reel (owner only)
router.delete("/:id", auth, deleteReel);

module.exports = router;
