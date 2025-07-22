const jwt = require("jsonwebtoken");
const User = require("../models/User");

const protect = async (req, res, next) => {
  let token;

  try {
    // 🔐 Extract token from Authorization header
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      token = req.headers.authorization.split(" ")[1];

      // 🔓 Decode and verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // 👤 Find the user (excluding password)
      const user = await User.findById(decoded.id).select("-password");

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // 🛑 If user is blocked, deny access
      if (user.isBlocked) {
        return res.status(403).json({ message: "Your account has been blocked" });
      }

      // ✅ Attach user to request object
      req.user = user;
      next();
    } else {
      return res
        .status(401)
        .json({ message: "Not authorized, token missing" });
    }
  } catch (error) {
    console.error("🔐 JWT Error:", error.message);
    return res
      .status(401)
      .json({ message: "Not authorized, token invalid or expired" });
  }
};

module.exports = protect;
