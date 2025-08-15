const express = require("express");
const router = express.Router();

const {
  sendOtp,                // POST /api/otp/send        -> { email, purpose: 'register' | 'forgot' }
  verifyOtp,              // POST /api/otp/verify      -> { email, otp }           (registration)
  resetPasswordWithOtp    // POST /api/otp/reset       -> { email, otp, newPassword } (forgot pw)
} = require("../controllers/otpController");

// Send OTP (use purpose to choose template/subject)
router.post("/send", sendOtp);

// Verify email for registration (does NOT change password)
router.post("/verify", verifyOtp);

// Reset password using OTP (forgot-password flow)
router.post("/reset", resetPasswordWithOtp);

module.exports = router;
