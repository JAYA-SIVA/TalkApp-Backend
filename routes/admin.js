const express = require("express");
const router = express.Router();
const User = require("../models/User");
const { ensureAuthenticated } = require("../middleware");

// Middleware to check if user is admin
const checkAdmin = async (req, res, next) => {
  try {
    const adminId = req.user.id;
    const adminUser = await User.findById(adminId);

    // This assumes your User schema has an `isAdmin` field
    if (!adminUser || !adminUser.isAdmin) {
      return res.status(403).json({ error: "Access denied. Admin only." });
    }

    next();
  } catch (err) {
    res.status(500).json({ error: "Server error", details: err.message });
  }
};

// GET all users (admin only)
router.get("/users", ensureAuthenticated, checkAdmin, async (req, res) => {
  try {
    const users = await User.find().select("-password");
    res.status(200).json(users);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch users", details: err.message });
  }
});

// Block or unblock a user
router.put("/block/:id", ensureAuthenticated, checkAdmin, async (req, res) => {
  try {
    const userId = req.params.id;
    const { block } = req.body; // true = block, false = unblock

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    user.isBlocked = block;
    await user.save();

    res.status(200).json({ message: `User ${block ? "blocked" : "unblocked"} successfully` });
  } catch (err) {
    res.status(500).json({ error: "Failed to update user status", details: err.message });
  }
});

module.exports = router;
