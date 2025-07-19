// routes/user.js

const express    = require("express");
const router     = express.Router();
const User       = require("../models/User");
const { ensureAuthenticated } = require("../middleware");

// GET  /api/user/:username  → fetch a user’s profile
router.get("/:username", ensureAuthenticated, async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username })
                           .select("-password"); // hide hashed password
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json({
      _id:             user._id,
      username:        user.username,
      email:           user.email,
      profileImageUrl: user.profile,
      bio:             user.bio || ""
    });
  } catch (err) {
    console.error("GET /api/user error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// PUT  /api/user/:username  → update username, bio, or profile image
router.put("/:username", ensureAuthenticated, async (req, res) => {
  try {
    const { username: newUsername, bio, profileImageUrl } = req.body;
    const user = await User.findOne({ username: req.params.username });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (newUsername)      user.username = newUsername;
    if (bio !== undefined) user.bio      = bio;
    if (profileImageUrl)  user.profile  = profileImageUrl;

    await user.save();

    res.json({
      _id:             user._id,
      username:        user.username,
      email:           user.email,
      profileImageUrl: user.profile,
      bio:             user.bio || ""
    });
  } catch (err) {
    console.error("PUT /api/user error:", err);
    res.status(500).json({ error: "Update failed" });
  }
});

module.exports = router;
