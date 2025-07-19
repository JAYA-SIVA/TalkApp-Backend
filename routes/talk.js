const express = require("express");
const router = express.Router();
const { ensureAuthenticated } = require("../middleware");
const upload = require("../middleware/multer");

const {
  uploadPost,
  getFeed,
  toggleLike,
  addComment,
} = require("../controllers/talk");

// ✅ Upload a new post (image or video)
router.post(
  "/upload",
  ensureAuthenticated,
  upload.single("file"), // Use 'file' as field name in form-data
  uploadPost
);

// ✅ Get all posts for feed
router.get("/", ensureAuthenticated, getFeed);

// ✅ Like or unlike a post
router.put("/like", ensureAuthenticated, toggleLike);

// ✅ Add a comment to a post
router.post("/comment", ensureAuthenticated, addComment);

module.exports = router;
