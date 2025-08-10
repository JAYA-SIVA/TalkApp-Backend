const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    // 👤 Basic Info
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 3,
      maxlength: 30,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
      minlength: 6,
    },

    // 📝 Profile Info
    bio: {
      type: String,
      default: "",
      maxlength: 300,
    },
    profilePic: {
      type: String,
      default: "", // Cloudinary URL or default image
    },

    // 🔐 Admin Control
    isBlocked: {
      type: Boolean,
      default: false,
    },

    // 👥 Social Graph
    followers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    following: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    // 🛡️ Privacy + Follow Requests (NEW)
    isPrivate: {
      type: Boolean,
      default: false, // true → requests must be accepted
    },
    followRequests: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User", // users who requested to follow me
      },
    ],

    // 🛡️ User Role
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },

    // 🔁 Token Management
    refreshTokens: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: true, // adds createdAt, updatedAt
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ✅ Ensure array defaults (safer if existing docs missing fields)
if (!userSchema.path("followers").options.default) userSchema.path("followers").options.default = [];
if (!userSchema.path("following").options.default) userSchema.path("following").options.default = [];
if (!userSchema.path("followRequests").options.default) userSchema.path("followRequests").options.default = [];

// 🔢 Virtual counts (handy for API responses/UI)
userSchema.virtual("followersCount").get(function () {
  return Array.isArray(this.followers) ? this.followers.length : 0;
});
userSchema.virtual("followingCount").get(function () {
  return Array.isArray(this.following) ? this.following.length : 0;
});
userSchema.virtual("requestsCount").get(function () {
  return Array.isArray(this.followRequests) ? this.followRequests.length : 0;
});

// 🔍 Indexing for faster queries
userSchema.index({ username: 1 });
userSchema.index({ email: 1 });

module.exports = mongoose.model("User", userSchema);
