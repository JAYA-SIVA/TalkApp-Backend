// models/User.js
const mongoose = require("mongoose");
const { Schema } = mongoose;

const userSchema = new Schema(
  {
    /* 👤 Basic Info */
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 3,
      maxlength: 30,
      index: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    password: {
      type: String,
      required: true,
      minlength: 6,
      select: false, // hide by default in queries
    },

    /* 📝 Profile */
    bio: {
      type: String,
      default: "",
      maxlength: 300,
    },
    profilePic: {
      type: String, // Cloudinary URL or default image
      default: "",
    },

    /* 🔐 Admin Control */
    isBlocked: {
      type: Boolean,
      default: false,
    },

    /* 👥 Social Graph */
    followers: {
      type: [{ type: Schema.Types.ObjectId, ref: "User" }],
      default: [],
    },
    following: {
      type: [{ type: Schema.Types.ObjectId, ref: "User" }],
      default: [],
    },

    /* 🛡️ Privacy + Follow Requests */
    isPrivate: {
      type: Boolean,
      default: false, // true → requests must be accepted
    },
    followRequests: {
      type: [{ type: Schema.Types.ObjectId, ref: "User" }], // users who requested to follow me
      default: [],
    },

    /* 🛡️ User Role */
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },

    /* 🔁 Token Management */
    refreshTokens: {
      type: [String],
      default: [],
      select: false, // keep out of default projections
    },
  },
  {
    timestamps: true, // createdAt, updatedAt
    toJSON: { virtuals: true, transform: (_doc, ret) => {
      delete ret.password;
      delete ret.refreshTokens;
      delete ret.__v;
      return ret;
    }},
    toObject: { virtuals: true },
  }
);

/* 🔢 Virtual counts (handy for API/UI) */
userSchema.virtual("followersCount").get(function () {
  return Array.isArray(this.followers) ? this.followers.length : 0;
});
userSchema.virtual("followingCount").get(function () {
  return Array.isArray(this.following) ? this.following.length : 0;
});
userSchema.virtual("requestsCount").get(function () {
  return Array.isArray(this.followRequests) ? this.followRequests.length : 0;
});

/* 🔍 Indexes */
userSchema.index({ username: 1 }); // unique declared in field
userSchema.index({ email: 1 });    // unique declared in field

module.exports = mongoose.models.User || mongoose.model("User", userSchema);
