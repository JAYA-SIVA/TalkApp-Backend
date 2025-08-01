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
  updateUserByUsername // ✅ New controller added
} = require("../controllers/userController");

// ✅ Register & Login
router.post("/register", registerUser);
router.post("/login", loginUser);

// ✅ Get All Users
router.get("/", protect, getAllUsers);

// ✅ Get User by Username / Email / Both (MUST BE ABOVE /:id!)
router.get("/username/:username", protect, getUserByUsername);
router.get("/email/:email", protect, getUserByEmail);
router.get("/identifier/:identifier", protect, getUserByUsernameOrEmail);

// ✅ Profile Actions
router.get("/:id", protect, getUserProfile);
router.put("/:id", protect, updateUserProfile);

// ✅ Follow & Unfollow
router.put("/follow/:id", protect, followUser);
router.put("/unfollow/:id", protect, unfollowUser);

// ✅ Update Password Routes
router.put("/update-password/:id", protect, updatePasswordById);
router.put("/update-password-by-username/:username", protect, updatePasswordByUsername);
router.put("/update-password-by-identifier/:identifier", protect, updatePasswordByUsernameOrEmail);

// ✅ Delete User Routes
router.delete("/delete/:id/:username", deleteUserByIdAndUsername);     // By ID + Username
router.delete("/delete-by-id/:id", deleteUserById);                    // By ID only
router.delete("/delete-by-username/:username", deleteUserByUsername); // By Username only

// ✅ 🔥 Update User by Username (NEW)
router.put("/update/:username", protect, updateUserByUsername);

module.exports = router;
