// middleware/authMiddleware.js
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const User = require("../models/User");

const isObjectId = (id) => mongoose.Types.ObjectId.isValid(String(id || "").trim());

/** Extract token from Authorization, X-Access-Token, Cookie, or (optional) query */
function extractToken(req) {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (authHeader && typeof authHeader === "string") {
    const [scheme, value] = authHeader.split(" ");
    if (/^Bearer$/i.test(scheme) && value) return value.trim();
    if (/^Token$/i.test(scheme) && value) return value.trim();
  }
  if (req.headers["x-access-token"]) return String(req.headers["x-access-token"]).trim();
  if (req.cookies?.accessToken) return String(req.cookies.accessToken).trim();
  // uncomment if you really want to allow ?token=
  // if (req.query?.token) return String(req.query.token).trim();
  return null;
}

/**
 * Access-token guard
 * - Accepts token from Authorization (Bearer/Token), X-Access-Token, cookies
 * - Verifies with ACCESS_TOKEN_SECRET (or fallback JWT_SECRET)
 * - Attaches req.user (doc) & req.auth.userId (string)
 */
module.exports = async function protect(req, res, next) {
  try {
    if (req.method === "OPTIONS") return next(); // CORS preflight

    const token = extractToken(req);
    if (!token) {
      return res.status(401).json({ code: "NO_TOKEN", message: "Unauthorized: no access token" });
    }

    const secret = (process.env.ACCESS_TOKEN_SECRET || process.env.JWT_SECRET || "").trim();
    if (!secret) {
      console.error("[auth] ACCESS_TOKEN_SECRET/JWT_SECRET is missing");
      return res.status(500).json({ code: "SERVER_CONFIG", message: "Server configuration error" });
    }

    const verifyOpts = {
      algorithms: ["HS256"],
      clockTolerance: 5, // seconds
      // issuer: process.env.JWT_ISSUER,
      // audience: process.env.JWT_AUDIENCE,
    };

    let decoded;
    try {
      decoded = jwt.verify(token, secret, verifyOpts);
    } catch (err) {
      if (err.name === "TokenExpiredError") {
        return res.status(401).json({ code: "TOKEN_EXPIRED", message: "Token expired. Please login again." });
      }
      return res.status(401).json({ code: "TOKEN_INVALID", message: "Invalid access token" });
    }

    const uid = decoded.id || decoded._id || decoded.sub;
    if (!isObjectId(uid)) {
      return res.status(400).json({ code: "BAD_TOKEN_SUBJECT", message: "Invalid token payload (user id)" });
    }

    const user = await User.findById(uid).select("-password");
    if (!user) {
      return res.status(404).json({ code: "USER_NOT_FOUND", message: "User not found" });
    }

    if (user.isBlocked) {
      return res.status(403).json({ code: "USER_BLOCKED", message: "Access denied: user is blocked" });
    }

    req.user = user;
    req.auth = {
      userId: String(user._id),
      token,
      // roles: user.roles || [],
    };

    return next();
  } catch (error) {
    console.error("[auth] Unexpected error:", error);
    return res.status(401).json({ code: "AUTH_FAILURE", message: "Unauthorized" });
  }
};
