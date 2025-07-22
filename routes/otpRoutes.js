const express = require("express");
const router = express.Router();
const { sendOtp, verifyOtpAndResetPassword } = require("../controllers/otpController");

router.post("/send", sendOtp);       // POST /api/otp/send
router.post("/verify", verifyOtpAndResetPassword);  // POST /api/otp/verify

module.exports = router;
