// models/User.js
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const { Schema } = mongoose;

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
      validate: {
        validator: (v) => EMAIL_RX.test(String(v || "").trim()),
        message: "Invalid email format",
      },
      set: (v) => String(v || "").trim().toLowerCase(),
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
      trim: true,
    },
    profilePic: {
      type: String, // Cloudinary URL or default image
      default: "",
      trim: true,
    },

    /* 🔐 Admin Control */
    isBlocked: {
      type: Boolean,
      default: false,
    },

    /* 👥 Social Graph */
    followers: [{ type: Schema.Types.ObjectId, ref: "User" }],
    following: [{ type: Schema.Types.ObjectId, ref: "User" }],

    /* 🛡️ Privacy + Follow Requests */
    isPrivate: {
      type: Boolean,
      default: false, // true → requests must be accepted
    },
    followRequests: [{ type: Schema.Types.ObjectId, ref: "User" }],

    /* 🛡️ User Role */
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
      index: true,
    },

    /* 🔁 Token Management */
    refreshTokens: {
      type: [String],
      default: [],
      select: false, // keep out of default projections
    },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret) => {
        delete ret.password;
        delete ret.refreshTokens;
        delete ret.__v;
        return ret;
      },
    },
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

/* 🔧 Helpers (non-breaking) */
userSchema.methods.comparePassword = async function (plain) {
  // works even if password not selected (you should re-fetch with .select('+password') when needed)
  if (!this.password) {
    const fresh = await this.constructor.findById(this._id).select("+password");
    return fresh?.password ? bcrypt.compare(String(plain), fresh.password) : false;
  }
  return bcrypt.compare(String(plain), this.password);
};

userSchema.methods.setPassword = async function (plain) {
  this.password = await bcrypt.hash(String(plain), 10);
  return this.password;
};

/* 🔍 Indexes */
userSchema.index({ username: 1 }, { unique: true });
userSchema.index({ email: 1 }, { unique: true });

module.exports = mongoose.models.User || mongoose.model("User", userSchema);
