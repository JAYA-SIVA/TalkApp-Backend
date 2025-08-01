const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const User = require("../models/User");

const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "❌ Unauthorized: No token provided" });
    }

    const token = authHeader.split(" ")[1];

    // ✅ Verify and decode token
    const decoded = jwt.verify(token, (process.env.ACCESS_TOKEN_SECRET || "").trim());

    if (!decoded.id || !mongoose.Types.ObjectId.isValid(decoded.id)) {
      return res.status(400).json({ message: "❌ Invalid token payload: user ID is invalid" });
    }

    const user = await User.findById(decoded.id).select("-password");

    if (!user) {
      return res.status(404).json({ message: "❌ User not found" });
    }

    // 🚫 Blocked user check (optional)
    if (user.isBlocked) {
      return res.status(403).json({ message: "🚫 Access denied: User is blocked" });
    }

    // ✅ Attach user to request
    req.user = user;
    next();
  } catch (error) {
    console.error("❌ Auth Middleware Error:", error.message);

    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ message: "⚠️ Token expired. Please login again." });
    }

    return res.status(401).json({ message: "❌ Invalid or expired access token" });
  }
};

module.exports = protect;
