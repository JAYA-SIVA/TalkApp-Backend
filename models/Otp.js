// models/Otp.js

const mongoose = require("mongoose");

// OTP Schema
const otpSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    lowercase: true, // optional: normalize email
    trim: true
  },
  otp: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 300 // 🔐 TTL: Automatically deletes document after 5 mins (300 seconds)
  },
  attempts: {
    type: Number,
    default: 0 // Used to block brute-force
  }
});

module.exports = mongoose.model("Otp", otpSchema);
