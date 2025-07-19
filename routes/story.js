const express = require("express");
const router = express.Router();
const { ensureAuthenticated } = require("../middleware");
const upload = require("../middleware/multer");
const {
  uploadStory,
  getStories,
  deleteStory,
} = require("../controllers/storyController");

// ✅ Upload a new Click (story)
router.post("/upload", ensureAuthenticated, upload.single("file"), uploadStory);

// ✅ Get all active Clicks (posted within 24 hours)
router.get("/", ensureAuthenticated, getStories);

// ✅ Delete a Click by ID (only by the owner)
router.delete("/:storyId", ensureAuthenticated, deleteStory);

module.exports = router;
