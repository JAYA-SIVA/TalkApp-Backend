// config/cloudinary.js

const cloudinary = require('cloudinary').v2;
const dotenv = require('dotenv');

// ✅ Load environment variables from .env file
dotenv.config();

// ✅ Validate required variables
const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;

if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
  console.error("❌ Cloudinary configuration missing in .env");
  console.error("🔎 Required: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET");
  process.exit(1); // Stop the server
}

// ✅ Configure Cloudinary with your credentials
cloudinary.config({
  cloud_name: CLOUDINARY_CLOUD_NAME,
  api_key: CLOUDINARY_API_KEY,
  api_secret: CLOUDINARY_API_SECRET,
});

// ✅ Optional: Debug logs (only in dev)
if (process.env.NODE_ENV !== "production") {
  console.log("✅ Cloudinary Config Loaded:");
  console.log("📌 Cloud Name:", CLOUDINARY_CLOUD_NAME);
  console.log("📌 API Key:", CLOUDINARY_API_KEY);
  console.log("📌 API Secret:", CLOUDINARY_API_SECRET ? "✅ Loaded" : "❌ MISSING");
}

module.exports = cloudinary;
