const express = require("express");
const router = express.Router();
const { ensureAuthenticated } = require("../middleware");
const {
  toggleBookmark,
  getBookmarkedPosts,
} = require("../controllers/bookmarks");

// ✅ Toggle save/unsave a post
router.put("/toggle", ensureAuthenticated, toggleBookmark);

// ✅ Get all bookmarked posts for a user
router.get("/:userId", ensureAuthenticated, getBookmarkedPosts);

module.exports = router;
