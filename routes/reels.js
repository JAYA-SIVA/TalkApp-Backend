const express = require("express");
const router = express.Router();
const { ensureAuthenticated } = require("../middleware");
const upload = require("../middleware/multer");
const {
  uploadReel,
  getAllReels,
  deleteReel,
} = require("../controllers/reels");

// ✅ Upload a new reel (video)
router.post("/upload", ensureAuthenticated, upload.single("file"), uploadReel);

// ✅ Get all reels
router.get("/", ensureAuthenticated, getAllReels);

// ✅ Delete a reel by ID
router.delete("/:postId", ensureAuthenticated, deleteReel);

module.exports = router;
