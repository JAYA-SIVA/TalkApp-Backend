// middleware/auth.js
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const User = require("../models/User");

/** Pull the bearer token from common places */
function extractToken(req) {
  // Standard: Authorization: Bearer <token>
  const auth = req.headers.authorization || req.headers.Authorization;
  if (auth && typeof auth === "string") {
    const [scheme, token] = auth.split(" ");
    if (/^Bearer$/i.test(scheme) && token) return token.trim();
    // Some clients send "Token <jwt>"
    if (/^Token$/i.test(scheme) && token) return token.trim();
  }
  // Fallbacks
  if (req.headers["x-access-token"]) return String(req.headers["x-access-token"]).trim();
  if (req.query && req.query.token) return String(req.query.token).trim(); // only if you need this
  return null;
}

const protect = async (req, res, next) => {
  try {
    // Let CORS preflight through without a token
    if (req.method === "OPTIONS") return next();

    const token = extractToken(req);
    if (!token) {
      return res.status(401).json({
        code: "NO_TOKEN",
        message: "Unauthorized: No access token provided",
      });
    }

    const ACCESS_SECRET =
      (process.env.ACCESS_TOKEN_SECRET || process.env.JWT_SECRET || "").trim();

    if (!ACCESS_SECRET) {
      console.error("[auth] Missing ACCESS_TOKEN_SECRET/JWT_SECRET");
      return res.status(500).json({
        code: "SERVER_CONFIG",
        message: "Server misconfiguration: missing access token secret",
      });
    }

    // Verify JWT
    let decoded;
    try {
      decoded = jwt.verify(token, ACCESS_SECRET);
    } catch (e) {
      if (e.name === "TokenExpiredError") {
        return res.status(401).json({ code: "TOKEN_EXPIRED", message: "Access token expired" });
      }
      return res.status(401).json({ code: "TOKEN_INVALID", message: "Invalid access token" });
    }

    // Resolve user id from common fields
    const rawId = decoded.id || decoded._id || decoded.sub;
    if (!rawId || !mongoose.Types.ObjectId.isValid(rawId)) {
      return res.status(400).json({
        code: "BAD_TOKEN_SUBJECT",
        message: "Invalid user id in access token",
      });
    }

    const user = await User.findById(rawId).select("-password");
    if (!user) {
      return res.status(404).json({ code: "USER_NOT_FOUND", message: "User not found" });
    }

    if (user.isBlocked) {
      return res.status(403).json({ code: "USER_BLOCKED", message: "Access denied: user is blocked" });
    }

    // Attach to request for downstream handlers
    req.user = user;
    req.userId = user._id.toString();
    return next();
  } catch (err) {
    console.error("Auth Middleware Error:", err);
    return res.status(401).json({
      code: "AUTH_FAILURE",
      message: "Invalid or expired access token",
    });
  }
};

module.exports = protect;
