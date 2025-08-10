const express = require("express");
const router = express.Router();
const protect = require("../middleware/authMiddleware");

const {
  // auth
  registerUser,
  loginUser,

  // queries
  getAllUsers,
  searchUsersByUsername,
  getUserByUsername,
  getUserByEmail,
  getUserByUsernameOrEmail,

  // profile
  getMe,                  // NEW: current user
  getUserProfile,         // GET /:id
  updateUserByUsername,   // PUT /update/:username
  updateUserProfileById,  // NEW: PUT /:id

  // social
  followUser,
  unfollowUser,

  // password
  updatePasswordById,
  updatePasswordByUsername,
  updatePasswordByUsernameOrEmail,

  // deletes
  deleteUserByIdAndUsername,
  deleteUserById,
  deleteUserByUsername,
} = require("../controllers/userController");

// ---------- Auth ----------
router.post("/register", registerUser);
router.post("/login", loginUser);

// ---------- Users list & search ----------
router.get("/", protect, getAllUsers);
router.get("/search", protect, searchUsersByUsername);

// ---------- Specific lookups (keep BEFORE /:id) ----------
router.get("/by-username/:username", protect, getUserByUsername);
router.get("/email/:email", protect, getUserByEmail);
router.get("/identifier/:identifier", protect, getUserByUsernameOrEmail);

// ---------- Current user ----------
router.get("/me", protect, getMe);

// ---------- Update by username ----------
router.put("/update/:username", protect, updateUserByUsername);

// ---------- Follow / Unfollow ----------
router.put("/follow/:id", protect, followUser);
router.put("/unfollow/:id", protect, unfollowUser);

// ---------- Password (specific BEFORE /:id) ----------
router.put("/update-password-by-username/:username", protect, updatePasswordByUsername);
router.put("/update-password-by-identifier/:identifier", protect, updatePasswordByUsernameOrEmail);
router.put("/update-password/:id", protect, updatePasswordById);

// ---------- Generic ID routes (keep LAST) ----------
router.get("/:id", protect, getUserProfile);
router.put("/:id", protect, updateUserProfileById);

// ---------- Delete (add `protect` here if you want to lock down) ----------
router.delete("/delete/:id/:username", deleteUserByIdAndUsername);
router.delete("/delete-by-id/:id", deleteUserById);
router.delete("/delete-by-username/:username", deleteUserByUsername);

module.exports = router;
