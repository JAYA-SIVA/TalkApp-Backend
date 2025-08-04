const express = require("express");
const router = express.Router();
const protect = require("../middleware/authMiddleware");

const {
  registerUser,
  loginUser,
  getUserProfile,
  updateUserProfile,
  getAllUsers,
  followUser,
  unfollowUser,
  getUserByUsername,
  getUserByEmail,
  getUserByUsernameOrEmail,
  updatePasswordById,
  updatePasswordByUsername,
  updatePasswordByUsernameOrEmail,
  deleteUserByIdAndUsername,
  deleteUserById,
  deleteUserByUsername,
  updateUserByUsername,
  searchUsersByUsername, // ✅ NEW: Search controller added
} = require("../controllers/userController");

// ✅ Register & Login
router.post("/register", registerUser);
router.post("/login", loginUser);

// ✅ Get All Users
router.get("/", protect, getAllUsers);

// ✅ 🔍 Search Users by Username (query param)
router.get("/search", protect, searchUsersByUsername); // ✅ NEW: Search route

// ✅ User lookup (username/email/identifier)
router.get("/by-username/:username", protect, getUserByUsername); // By Username
router.get("/email/:email", protect, getUserByEmail);             // By Email
router.get("/identifier/:identifier", protect, getUserByUsernameOrEmail); // By either

// ✅ Profile - ID-based
router.get("/:id", protect, getUserProfile);           // Get user by ID
router.put("/:id", protect, updateUserProfile);        // Update by ID (edit page if ID used)

// ✅ 🔥 Update Profile by Username (Edit Profile button use this)
router.put("/update/:username", protect, updateUserByUsername); // ✅ This is main update route

// ✅ Follow/Unfollow
router.put("/follow/:id", protect, followUser);
router.put("/unfollow/:id", protect, unfollowUser);

// ✅ Password Management
router.put("/update-password/:id", protect, updatePasswordById);
router.put("/update-password-by-username/:username", protect, updatePasswordByUsername);
router.put("/update-password-by-identifier/:identifier", protect, updatePasswordByUsernameOrEmail);

// ✅ Delete User Routes
router.delete("/delete/:id/:username", deleteUserByIdAndUsername);     // ID + Username
router.delete("/delete-by-id/:id", deleteUserById);                    // ID only
router.delete("/delete-by-username/:username", deleteUserByUsername); // Username only

module.exports = router;
