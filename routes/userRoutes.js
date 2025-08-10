const express = require("express");
const router = express.Router();
const protect = require("../middleware/authMiddleware");

const {
  // ── auth ──
  registerUser,
  loginUser,

  // ── queries ──
  getAllUsers,
  searchUsersByUsername,
  getUserByUsername,
  getUserByEmail,
  getUserByUsernameOrEmail,

  // ── profile ──
  getMe,                    // GET /me
  getUserProfile,           // GET /:id
  updateUserByUsername,     // PUT /update/:username
  updateUserProfileById,    // PUT /:id   (make sure this exists in your controller)

  // ── social (public follow) ──
  followUser,
  unfollowUser,

  // ── social (requests/private) NEW ──
  getMyFollowRequests,      // GET /requests
  acceptFollowRequest,      // PUT /requests/accept/:requesterId
  rejectFollowRequest,      // PUT /requests/reject/:requesterId
  cancelSentFollowRequest,  // DELETE /requests/cancel/:targetId
  setPrivacy,               // PUT /privacy
  getFollowersForUser,      // GET /followers/list/:id
  getFollowingForUser,      // GET /following/list/:id

  // ── password ──
  updatePasswordById,
  updatePasswordByUsername,
  updatePasswordByUsernameOrEmail,

  // ── deletes ──
  deleteUserByIdAndUsername,
  deleteUserById,
  deleteUserByUsername,
} = require("../controllers/userController");

// ───────────────── Auth ─────────────────
router.post("/register", registerUser);
router.post("/login", loginUser);

// ───────────────── Users list & search ─────────────────
router.get("/", protect, getAllUsers);
router.get("/search", protect, searchUsersByUsername);

// ───────────────── Specific lookups (KEEP BEFORE /:id) ─────────────────
router.get("/by-username/:username", protect, getUserByUsername);
router.get("/email/:email", protect, getUserByEmail);
router.get("/identifier/:identifier", protect, getUserByUsernameOrEmail);

// ───────────────── Current user ─────────────────
router.get("/me", protect, getMe);

// ───────────────── Profile update by username ─────────────────
router.put("/update/:username", protect, updateUserByUsername);

// ───────────────── Follow / Unfollow (instant follow for public) ─────────────────
router.put("/follow/:id", protect, followUser);
router.put("/unfollow/:id", protect, unfollowUser);

// ───────────────── Follow Requests / Privacy (NEW) ─────────────────
// My incoming requests (people who want to follow me)
router.get("/requests", protect, getMyFollowRequests);
// Accept / Reject a requester
router.put("/requests/accept/:requesterId", protect, acceptFollowRequest);
router.put("/requests/reject/:requesterId", protect, rejectFollowRequest);
// Cancel a request I previously sent to someone private
router.delete("/requests/cancel/:targetId", protect, cancelSentFollowRequest);
// Toggle privacy (body: { isPrivate: boolean })
router.put("/privacy", protect, setPrivacy);
// Convenience lists that return populated users (fewer mobile round-trips)
router.get("/followers/list/:id", protect, getFollowersForUser);
router.get("/following/list/:id", protect, getFollowingForUser);

// ───────────────── Password (KEEP BEFORE /:id) ─────────────────
router.put("/update-password-by-username/:username", protect, updatePasswordByUsername);
router.put("/update-password-by-identifier/:identifier", protect, updatePasswordByUsernameOrEmail);
router.put("/update-password/:id", protect, updatePasswordById);

// ───────────────── Generic ID routes (KEEP LAST so they don't shadow others) ─────────────────
router.get("/:id", protect, getUserProfile);
router.put("/:id", protect, updateUserProfileById);

// ───────────────── Delete (add protect if needed) ─────────────────
router.delete("/delete/:id/:username", deleteUserByIdAndUsername);
router.delete("/delete-by-id/:id", deleteUserById);
router.delete("/delete-by-username/:username", deleteUserByUsername);

module.exports = router;
