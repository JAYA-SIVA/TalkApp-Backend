// middleware/index.js

const jwt = require("jsonwebtoken");

/**
 * Verify JWT and attach the decoded payload to `req.user`.
 * Returns 401 if no token, 403 if invalid/expired.
 */
const ensureAuthenticated = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized: No token provided" });
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({
      error:   "Invalid or expired token",
      details: err.message
    });
  }
};

module.exports = { ensureAuthenticated };
