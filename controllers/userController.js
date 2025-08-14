// controllers/userController.js
const User = require("../models/User");
const Post = require("../models/Post");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

/* -------------------------- Inline Notifications -------------------------- */
// Load Notification model; if missing, skip gracefully.
let Notification = null;
try {
  Notification = require("../models/Notification");
} catch (e) {
  console.warn("[userController] Notification model not found. Notifications will be skipped.");
}

/**
 * Create a notification with correct schema fields.
 * Always writes: userId, fromUserId, seen=false.
 */
const createNotification = async (opts = {}) => {
  if (!Notification) return; // no-op if model not available

  const {
    // receiver
    userId, recipientId, to,
    // actor
    fromUserId, actorId, from,
    type,
    message = "",
    postId = null,
    meta = {},
  } = opts;

  const receiver = userId || recipientId || to;
  const actor = fromUserId || actorId || from;

  if (!receiver || !actor || !type) return;
  if (String(receiver) === String(actor)) return; // no self-notify

  try {
    // Prefer model static if available
    if (typeof Notification.pushNotification === "function") {
      await Notification.pushNotification({
        userId: receiver,
        fromUserId: actor,
        type,
        postId,
        message,
        meta,
      });
    } else {
      await Notification.create({
        userId: receiver,
        fromUserId: actor,
        type,
        postId,
        message,
        meta,
        seen: false,
      });
    }

    // Emit to receiver room (Socket.IO)
    if (global.io) {
      global.io.to(String(receiver)).emit("new_notification", {
        userId: String(receiver),
        fromUserId: String(actor),
        type,
        postId,
        message,
        meta,
      });
    }
  } catch (err) {
    console.error("[createNotification] error:", err.message);
  }
};
/* ------------------------------------------------------------------------- */

/* ----------------------------- Token helpers ----------------------------- */
const generateTokens = (user) => {
  const payload = { id: user._id, username: user.username };

  const accessToken = jwt.sign(payload, process.env.ACCESS_TOKEN_SECRET, {
    expiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN || "15m",
  });

  const refreshToken = jwt.sign(payload, process.env.REFRESH_TOKEN_SECRET, {
    expiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || "30d",
  });

  return { accessToken, refreshToken };
};

/* ------------------------------ URL helpers ------------------------------ */
const makeAbsoluteUrl = (req, url) => {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  const base = `${req.protocol}://${req.get("host")}`;
  return `${base}${url.startsWith("/") ? "" : "/"}${url}`;
};

/* --------------------------------- Auth ---------------------------------- */
const registerUser = async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password)
      return res.status(400).json({ message: "All fields required" });

    const exists = await User.findOne({ email: new RegExp(`^${email}$`, "i") });
    if (exists) return res.status(400).json({ message: "Email already registered" });

    const hash = await bcrypt.hash(password, 10);
    const user = await User.create({ username, email, password: hash });

    const tokens = generateTokens(user);
    res.status(201).json({
      _id: user._id,
      username: user.username,
      email: user.email,
      ...tokens,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: new RegExp(`^${email}$`, "i") });
    if (!user) return res.status(404).json({ message: "User not found" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: "Invalid credentials" });

    const tokens = generateTokens(user);
    res.json({
      _id: user._id,
      username: user.username,
      email: user.email,
      ...tokens,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ----------------------------- User - Queries ---------------------------- */
const getAllUsers = async (req, res) => {
  try {
    const users = await User.find().select("-password");
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const searchUsersByUsername = async (req, res) => {
  try {
    const { query } = req.query;
    if (!query) return res.status(400).json({ message: "Search query required" });

    const users = await User.find({
      username: { $regex: query, $options: "i" },
    }).select("_id username profilePic bio isPrivate");

    const normalized = users.map((u) => ({
      _id: u._id,
      username: u.username || "",
      bio: u.bio || "",
      isPrivate: !!u.isPrivate,
      profilePic: makeAbsoluteUrl(req, u.profilePic || ""),
    }));

    res.status(200).json(normalized);
  } catch (err) {
    res.status(500).json({ message: "Search failed", error: err.message });
  }
};

const getUserByUsername = async (req, res) => {
  try {
    const user = await User.findOne({
      username: new RegExp(`^${req.params.username}$`, "i"),
    }).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });

    const postsCount = await Post.countDocuments({ userId: user._id });
    res.json({
      _id: user._id,
      username: user.username || "",
      email: user.email || "",
      bio: user.bio || "No bio added",
      profilePic: makeAbsoluteUrl(req, user.profilePic || ""),
      followers: user.followers || [],
      following: user.following || [],
      isPrivate: !!user.isPrivate,
      postsCount,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const getUserByEmail = async (req, res) => {
  try {
    const user = await User.findOne({
      email: new RegExp(`^${req.params.email}$`, "i"),
    }).select("-password");

    if (!user) return res.status(404).json({ message: "User not found" });

    const postsCount = await Post.countDocuments({ userId: user._id });
    res.json({
      _id: user._id,
      username: user.username || "",
      email: user.email || "",
      bio: user.bio || "No bio added",
      profilePic: makeAbsoluteUrl(req, user.profilePic || ""),
      followers: user.followers || [],
      following: user.following || [],
      isPrivate: !!user.isPrivate,
      postsCount,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const getUserByUsernameOrEmail = async (req, res) => {
  try {
    const { identifier } = req.params;
    const user = await User.findOne({
      $or: [
        { username: new RegExp(`^${identifier}$`, "i") },
        { email: new RegExp(`^${identifier}$`, "i") },
      ],
    }).select("-password");

    if (!user) return res.status(404).json({ message: "User not found" });

    const postsCount = await Post.countDocuments({ userId: user._id });
    res.json({
      _id: user._id,
      username: user.username || "",
      email: user.email || "",
      bio: user.bio || "No bio added",
      profilePic: makeAbsoluteUrl(req, user.profilePic || ""),
      followers: user.followers || [],
      following: user.following || [],
      isPrivate: !!user.isPrivate,
      postsCount,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ------------------------------ User - Me/Id ----------------------------- */
const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });

    const postsCount = await Post.countDocuments({ userId: user._id });
    res.json({
      _id: user._id,
      username: user.username || "",
      email: user.email || "",
      bio: user.bio || "No bio added",
      profilePic: makeAbsoluteUrl(req, user.profilePic || ""),
      followers: user.followers || [],
      following: user.following || [],
      isPrivate: !!user.isPrivate,
      postsCount,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });

    const postsCount = await Post.countDocuments({ userId: user._id });
    res.json({
      _id: user._id,
      username: user.username || "",
      email: user.email || "",
      bio: user.bio || "No bio added",
      profilePic: makeAbsoluteUrl(req, user.profilePic || ""),
      followers: user.followers || [],
      following: user.following || [],
      isPrivate: !!user.isPrivate,
      postsCount,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ------------------------------ User - Update ---------------------------- */
const updateUserByUsername = async (req, res) => {
  try {
    const { username } = req.params;
    const { bio, profilePic, email } = req.body;

    const user = await User.findOne({
      username: new RegExp(`^${username}$`, "i"),
    });
    if (!user) return res.status(404).json({ message: "User not found" });

    if (req.body.username && req.body.username.toLowerCase() !== user.username.toLowerCase()) {
      const existing = await User.findOne({
        username: new RegExp(`^${req.body.username}$`, "i"),
      });
      if (existing && existing._id.toString() !== user._id.toString()) {
        return res.status(400).json({ message: "Username already taken" });
      }
      user.username = req.body.username;
    }

    if (email && email.toLowerCase() !== (user.email || "").toLowerCase()) {
      const existingEmail = await User.findOne({
        email: new RegExp(`^${email}$`, "i"),
      });
      if (existingEmail && existingEmail._id.toString() !== user._id.toString()) {
        return res.status(400).json({ message: "Email already in use" });
      }
      user.email = email;
    }

    if (typeof bio === "string") user.bio = bio;
    if (typeof profilePic === "string") user.profilePic = profilePic;

    const updated = await user.save();
    res.json({
      success: true,
      message: "Profile updated successfully",
      user: {
        _id: updated._id,
        username: updated.username,
        email: updated.email,
        bio: updated.bio || "No bio added",
        profilePic: makeAbsoluteUrl(req, updated.profilePic || ""),
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Update by ID
const updateUserProfileById = async (req, res) => {
  try {
    const { bio, profilePic, email, username } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (username && username.toLowerCase() !== user.username.toLowerCase()) {
      const exists = await User.findOne({
        username: new RegExp(`^${username}$`, "i"),
      });
      if (exists && exists._id.toString() !== user._id.toString()) {
        return res.status(400).json({ message: "Username already taken" });
      }
      user.username = username;
    }

    if (email && email.toLowerCase() !== (user.email || "").toLowerCase()) {
      const exists = await User.findOne({
        email: new RegExp(`^${email}$`, "i"),
      });
      if (exists && exists._id.toString() !== user._id.toString()) {
        return res.status(400).json({ message: "Email already in use" });
      }
      user.email = email;
    }

    if (typeof bio === "string") user.bio = bio;
    if (typeof profilePic === "string") user.profilePic = profilePic;

    const updated = await user.save();
    res.json({
      success: true,
      message: "Profile updated",
      user: {
        _id: updated._id,
        username: updated.username,
        email: updated.email,
        bio: updated.bio || "No bio added",
        profilePic: makeAbsoluteUrl(req, updated.profilePic || ""),
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ------------------------- Privacy (NEW) ------------------------- */
// PUT /api/user/privacy  { isPrivate: boolean }
const setPrivacy = async (req, res) => {
  try {
    const { isPrivate } = req.body;
    const me = await User.findById(req.user.id);
    if (!me) return res.status(404).json({ message: "User not found" });

    me.isPrivate = !!isPrivate;
    await me.save();
    res.json({ message: "Privacy updated", isPrivate: me.isPrivate });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ----------------------------- Follow / Unfollow ------------------------- */
const isIdInList = (list, id) => (list || []).some((x) => x.toString() === id);

const followUser = async (req, res) => {
  try {
    const targetId = req.params.id;
    const currentId = req.user.id;
    if (targetId === currentId)
      return res.status(400).json({ message: "Cannot follow yourself" });

    const [target, current] = await Promise.all([
      User.findById(targetId),
      User.findById(currentId),
    ]);
    if (!target || !current) return res.status(404).json({ message: "User not found" });

    // Already following?
    if (isIdInList(target.followers, currentId)) {
      return res.json({ message: "Already following", status: "following" });
    }

    // Private → create follow request (and notify target)
    if (target.isPrivate) {
      if (!isIdInList(target.followRequests, currentId)) {
        target.followRequests = target.followRequests || [];
        target.followRequests.push(currentId);
        await target.save();

        try {
          await createNotification({
            userId: targetId,
            fromUserId: currentId,
            type: "follow_request",
            message: `${current.username} requested to follow you`,
          });
        } catch (e) {
          console.error("notify follow_request:", e.message);
        }
      }
      return res.json({ message: "Follow request sent", status: "requested" });
    }

    // Public → follow immediately (and notify target)
    target.followers = target.followers || [];
    current.following = current.following || [];

    if (!isIdInList(target.followers, currentId)) target.followers.push(currentId);
    if (!isIdInList(current.following, targetId)) current.following.push(targetId);

    await Promise.all([target.save(), current.save()]);

    try {
      await createNotification({
        userId: targetId,
        fromUserId: currentId,
        type: "follow",
        message: `${current.username} started following you`,
      });
    } catch (e) {
      console.error("notify follow:", e.message);
    }

    res.json({ message: "Followed successfully", status: "following" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const unfollowUser = async (req, res) => {
  try {
    const targetId = req.params.id;
    const currentId = req.user.id;

    const [target, current] = await Promise.all([
      User.findById(targetId),
      User.findById(currentId),
    ]);
    if (!target || !current) return res.status(404).json({ message: "User not found" });

    target.followers = (target.followers || []).filter((id) => id.toString() !== currentId);
    current.following = (current.following || []).filter((id) => id.toString() !== targetId);

    // Also remove any pending request
    target.followRequests = (target.followRequests || []).filter((id) => id.toString() !== currentId);

    await Promise.all([target.save(), current.save()]);
    res.json({ message: "Unfollowed successfully", status: "none" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ---------------------- Follow Requests (NEW) ---------------------- */
const getMyFollowRequests = async (req, res) => {
  try {
    const me = await User.findById(req.user.id)
      .select("followRequests")
      .populate("followRequests", "_id username profilePic bio");
    const list = (me?.followRequests || []).map((u) => ({
      _id: u._id,
      username: u.username,
      bio: u.bio || "",
      profilePic: makeAbsoluteUrl(req, u.profilePic || ""),
    }));
    res.json(list);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PUT /api/user/requests/accept/:requesterId
const acceptFollowRequest = async (req, res) => {
  try {
    const requesterId = req.params.requesterId;
    const me = await User.findById(req.user.id);
    if (!me) return res.status(404).json({ message: "User not found" });

    if (!isIdInList(me.followRequests || [], requesterId)) {
      return res.status(400).json({ message: "No such request" });
    }

    // Remove from requests, add to followers
    me.followRequests = (me.followRequests || []).filter((id) => id.toString() !== requesterId);
    me.followers = me.followers || [];
    if (!isIdInList(me.followers, requesterId)) me.followers.push(requesterId);

    const requester = await User.findById(requesterId);
    if (!requester) return res.status(404).json({ message: "Requester not found" });

    requester.following = requester.following || [];
    if (!isIdInList(requester.following, me._id.toString())) requester.following.push(me._id);

    await Promise.all([me.save(), requester.save()]);

    try {
      await createNotification({
        userId: requesterId,
        fromUserId: me._id.toString(),
        type: "follow",
        message: `${me.username} accepted your follow request`,
      });
    } catch (e) {
      console.error("notify accept follow_request:", e.message);
    }

    res.json({ message: "Request accepted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PUT /api/user/requests/reject/:requesterId
const rejectFollowRequest = async (req, res) => {
  try {
    const requesterId = req.params.requesterId;
    const me = await User.findById(req.user.id);
    if (!me) return res.status(404).json({ message: "User not found" });

    me.followRequests = (me.followRequests || []).filter((id) => id.toString() !== requesterId);
    await me.save();

    res.json({ message: "Request rejected" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// DELETE /api/user/requests/cancel/:targetId
const cancelSentFollowRequest = async (req, res) => {
  try {
    const targetId = req.params.targetId;
    const target = await User.findById(targetId);
    if (!target) return res.status(404).json({ message: "User not found" });

    target.followRequests = (target.followRequests || []).filter((id) => id.toString() !== req.user.id);
    await target.save();
    res.json({ message: "Request cancelled" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ----------------- Convenience populated lists (NEW) ----------------- */
const getFollowersForUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select("followers")
      .populate("followers", "_id username profilePic bio");
    if (!user) return res.status(404).json({ message: "User not found" });

    const list = (user.followers || []).map((u) => ({
      _id: u._id,
      username: u.username,
      bio: u.bio || "",
      profilePic: makeAbsoluteUrl(req, u.profilePic || ""),
    }));
    res.json(list);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const getFollowingForUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select("following")
      .populate("following", "_id username profilePic bio");
    if (!user) return res.status(404).json({ message: "User not found" });

    const list = (user.following || []).map((u) => ({
      _id: u._id,
      username: u.username,
      bio: u.bio || "",
      profilePic: makeAbsoluteUrl(req, u.profilePic || ""),
    }));
    res.json(list);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ------------------------------- Passwords ------------------------------- */
const updatePasswordById = async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword) return res.status(400).json({ message: "newPassword required" });

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();
    res.json({ message: "Password updated" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const updatePasswordByUsername = async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword) return res.status(400).json({ message: "newPassword required" });

    const user = await User.findOne({
      username: new RegExp(`^${req.params.username}$`, "i"),
    });
    if (!user) return res.status(404).json({ message: "User not found" });

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();
    res.json({ message: "Password updated" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const updatePasswordByUsernameOrEmail = async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword) return res.status(400).json({ message: "newPassword required" });

    const identifier = req.params.identifier;
    const user = await User.findOne({
      $or: [
        { username: new RegExp(`^${identifier}$`, "i") },
        { email: new RegExp(`^${identifier}$`, "i") },
      ],
    });

    if (!user) return res.status(404).json({ message: "User not found" });

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();
    res.json({ message: "Password updated" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* --------------------------------- Delete -------------------------------- */
const deleteUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    await user.deleteOne();
    res.json({ message: "User deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const deleteUserByUsername = async (req, res) => {
  try {
    const user = await User.findOne({
      username: new RegExp(`^${req.params.username}$`, "i"),
    });
    if (!user) return res.status(404).json({ message: "User not found" });

    await user.deleteOne();
    res.json({ message: "User deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const deleteUserByIdAndUsername = async (req, res) => {
  try {
    const { id, username } = req.params;

    const user = await User.findOne({
      _id: id,
      username: new RegExp(`^${username}$`, "i"),
    });

    if (!user) return res.status(404).json({ message: "User not found" });

    await user.deleteOne();
    res.json({ message: "User deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* --------------------------------- Exports -------------------------------- */
module.exports = {
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
  getMe,
  getUserProfile,
  updateUserByUsername,
  updateUserProfileById,

  // social (public + requests)
  followUser,
  unfollowUser,
  getMyFollowRequests,
  acceptFollowRequest,
  rejectFollowRequest,
  cancelSentFollowRequest,
  setPrivacy,
  getFollowersForUser,
  getFollowingForUser,

  // passwords
  updatePasswordById,
  updatePasswordByUsername,
  updatePasswordByUsernameOrEmail,

  // deletes
  deleteUserById,
  deleteUserByUsername,
  deleteUserByIdAndUsername,
};
