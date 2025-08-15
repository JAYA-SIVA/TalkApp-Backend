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
    },
    // NEW: differentiate flows
    purpose: {
      type: String,
      enum: ["register", "forgot"],
      required: true,
      index: true,
    },
    // NEW: mark an OTP as used
    consumed: {
      type: Boolean,
      default: false,
    },
    // Limit brute-force
    attempts: {
      type: Number,
      default: 0,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    // NEW: explicit expiry moment; controller sets e.g. now + 10 minutes
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: false }
);

// TTL on expiresAt (auto-delete after it passes)
OtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("Otp", OtpSchema);
