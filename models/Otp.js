// models/Otp.js
const mongoose = require("mongoose");

const OtpSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    otp: {
      type: String,
      required: true,
      minlength: 4,
      maxlength: 12, // supports 4–12 length if you ever change format
      trim: true,
    },
    // differentiate flows
    purpose: {
      type: String,
      enum: ["register", "forgot"],
      required: true,
      index: true,
    },
    // mark an OTP as used
    consumed: {
      type: Boolean,
      default: false,
      index: true,
    },
    // brute-force protection
    attempts: {
      type: Number,
      default: 0,
      min: 0,
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    // explicit expiry moment; controller sets e.g. now + 10 minutes
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: false, versionKey: false }
);

// TTL on expiresAt (auto-delete once expired)
OtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Fast queries used by controllers:
// - findOne({ email, purpose, consumed:false }) .sort({ createdAt:-1 })
// - deleteMany({ email, purpose })
OtpSchema.index({ email: 1, purpose: 1, consumed: 1, createdAt: -1 });

module.exports = mongoose.model("Otp", OtpSchema, "otps");
