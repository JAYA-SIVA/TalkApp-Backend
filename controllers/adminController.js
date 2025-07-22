// controllers/adminController.js

const User = require("../models/User");
const mongoose = require("mongoose");
const ObjectId = mongoose.Types.ObjectId;

// 📌 Get all users (Admin-only)
exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find().select("-password"); // Exclude password
    res.status(200).json(users);
  } catch (err) {
    console.error("❌ Failed to fetch users:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// 🚫 Block or Unblock a user
exports.toggleBlockUser = async (req, res) => {
  const { id } = req.params;

  // ✅ Validate ObjectId
  if (!ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid user ID" });
  }

  try {
    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // 🔁 Toggle block status
    user.isBlocked = !user.isBlocked;
    await user.save();

    res.status(200).json({
      message: `User has been ${user.isBlocked ? "blocked" : "unblocked"}.`,
      userId: user._id,
      isBlocked: user.isBlocked,
    });
  } catch (err) {
    console.error("❌ Failed to toggle block:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};
