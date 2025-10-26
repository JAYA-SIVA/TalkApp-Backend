// middleware/authMiddleware.js
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const User = require("../models/User");

const isObjectId = (id) => mongoose.Types.ObjectId.isValid(String(id || "").trim());

/**
 * Access-token guard
 * - Looks for token in:
 *   1) Authorization: Bearer <token>
 *   2) X-Access-Token header
 *   3) Cookie: accessToken=<token>
 */
module.exports = async function protect(req, res, next) {
  try {
    // 1) Get token from headers/cookie
    let token = null;
    const authHeader = req.headers.authorization || req.headers.Authorization;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.slice(7).trim();
    } else if (req.headers["x-access-token"]) {
      token = String(req.headers["x-access-token"]).trim();
    } else if (req.cookies?.accessToken) {
      token = String(req.cookies.accessToken).trim();
    }

    if (!token) {
      return res.status(401).json({ message: "Unauthorized: no access token" });
    }

    // 2) Verify token
    const secret = (process.env.ACCESS_TOKEN_SECRET || "").trim();
    if (!secret) {
      console.error("[auth] ACCESS_TOKEN_SECRET is missing");
      return res.status(500).json({ message: "Server configuration error" });
    }

    const verifyOpts = {
      // uncomment if you set these when issuing tokens
      // issuer: process.env.JWT_ISSUER,
      // audience: process.env.JWT_AUDIENCE,
      algorithms: ["HS256"],
      clockTolerance: 5, // seconds of leeway for minor clock drift
    };

    let decoded;
    try {
      decoded = jwt.verify(token, secret, verifyOpts);
    } catch (err) {
      if (err.name === "TokenExpiredError") {
        return res.status(401).json({ message: "Token expired. Please login again." });
      }
      return res.status(401).json({ message: "Invalid access token" });
    }

    // 3) Resolve user id (support both "id" and standard "sub")
    const uid = decoded.id || decoded.sub;
    if (!isObjectId(uid)) {
      return res.status(400).json({ message: "Invalid token payload (user id)" });
    }

    // 4) Load user (minimal projection; exclude password)
    const user = await User.findById(uid).select("-password");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // 5) Blocked checks (optional)
    if (user.isBlocked) {
      return res.status(403).json({ message: "Access denied: user is blocked" });
    }

    // 6) Attach to request
    req.user = user;
    req.auth = {
      userId: String(user._id),
      token, // sometimes useful for downstream (e.g., logging)
      // roles: user.roles || [], // if you have roles
    };

    return next();
  } catch (error) {
    console.error("[auth] Unexpected error:", error.message);
    return res.status(401).json({ message: "Unauthorized" });
  }
};
