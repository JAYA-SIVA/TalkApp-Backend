const User = require("../models/User");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

// ✅ Generate Access and Refresh Tokens
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

// ✅ Register User
exports.registerUser = async (req, res) => {
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

// ✅ Login User
exports.loginUser = async (req, res) => {
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

// ✅ Get User Profile by ID
exports.getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ✅ Get User by Username
exports.getUserByUsername = async (req, res) => {
  try {
    const user = await User.findOne({ username: new RegExp(`^${req.params.username}$`, "i") }).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ✅ Get User by Email
exports.getUserByEmail = async (req, res) => {
  try {
    const user = await User.findOne({ email: new RegExp(`^${req.params.email}$`, "i") }).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ✅ Get User by Username or Email (identifier)
exports.getUserByUsernameOrEmail = async (req, res) => {
  try {
    const { identifier } = req.params;
    const user = await User.findOne({
      $or: [
        { username: new RegExp(`^${identifier}$`, "i") },
        { email: new RegExp(`^${identifier}$`, "i") },
      ],
    }).select("-password");

    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ✅ Update User Profile
exports.updateUserProfile = async (req, res) => {
  try {
    const { username, bio, profilePic, email } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (email && email !== user.email) {
      const emailExists = await User.findOne({ email: new RegExp(`^${email}$`, "i") });
      if (emailExists) return res.status(400).json({ message: "Email already in use" });
      user.email = email;
    }

    if (username && username !== user.username) {
      const usernameExists = await User.findOne({ username: new RegExp(`^${username}$`, "i") });
      if (usernameExists) return res.status(400).json({ message: "Username already in use" });
      user.username = username;
    }

    user.bio = bio || user.bio;
    user.profilePic = profilePic || user.profilePic;

    const updated = await user.save();
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ✅ Follow User
exports.followUser = async (req, res) => {
  try {
    const targetId = req.params.id;
    const currentId = req.user.id;

    if (targetId === currentId) return res.status(400).json({ message: "Cannot follow self" });

    const [target, current] = await Promise.all([
      User.findById(targetId),
      User.findById(currentId),
    ]);

    if (!target || !current) return res.status(404).json({ message: "User not found" });

    if (!target.followers.includes(currentId)) target.followers.push(currentId);
    if (!current.following.includes(targetId)) current.following.push(targetId);

    await Promise.all([target.save(), current.save()]);
    res.json({ message: "Followed successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ✅ Unfollow User
exports.unfollowUser = async (req, res) => {
  try {
    const targetId = req.params.id;
    const currentId = req.user.id;

    const [target, current] = await Promise.all([
      User.findById(targetId),
      User.findById(currentId),
    ]);
    if (!target || !current) return res.status(404).json({ message: "User not found" });

    target.followers = target.followers.filter((id) => id.toString() !== currentId);
    current.following = current.following.filter((id) => id.toString() !== targetId);

    await Promise.all([target.save(), current.save()]);
    res.json({ message: "Unfollowed successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ✅ Get All Users
exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find().select("-password");
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ✅ Update Password by ID
exports.updatePasswordById = async (req, res) => {
  try {
    const { newPassword } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();
    res.json({ message: "Password updated" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ✅ Update Password by Username
exports.updatePasswordByUsername = async (req, res) => {
  try {
    const { newPassword } = req.body;
    const user = await User.findOne({ username: new RegExp(`^${req.params.username}$`, "i") });
    if (!user) return res.status(404).json({ message: "User not found" });

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();
    res.json({ message: "Password updated" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ✅ Update Password by Identifier
exports.updatePasswordByUsernameOrEmail = async (req, res) => {
  try {
    const { newPassword } = req.body;
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

// ✅ Delete User by ID
exports.deleteUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    await user.deleteOne();
    res.json({ message: "User deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ✅ Delete User by Username
exports.deleteUserByUsername = async (req, res) => {
  try {
    const user = await User.findOne({ username: new RegExp(`^${req.params.username}$`, "i") });
    if (!user) return res.status(404).json({ message: "User not found" });

    await user.deleteOne();
    res.json({ message: "User deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ✅ Delete User by ID & Username (for extra security)
exports.deleteUserByIdAndUsername = async (req, res) => {
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
