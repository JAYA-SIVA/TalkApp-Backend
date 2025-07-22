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

    // 🛡️ User Role
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },

    // 🔁 Token Management (optional but useful for refresh token sessions)
    refreshTokens: [String],
  },
  {
    timestamps: true, // adds createdAt, updatedAt
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// 🔍 Indexing for faster queries
userSchema.index({ username: 1 });
userSchema.index({ email: 1 });

module.exports = mongoose.model("User", userSchema);
