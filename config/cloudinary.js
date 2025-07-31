// config/cloudinary.js

const cloudinary = require('cloudinary').v2;
const dotenv = require('dotenv');

// ✅ Load environment variables
dotenv.config();

// ✅ Validate environment config
const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;

if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
  console.error("❌ Cloudinary config missing in .env file");
  process.exit(1);
}

// ✅ Cloudinary setup
cloudinary.config({
  cloud_name: CLOUDINARY_CLOUD_NAME,
  api_key: CLOUDINARY_API_KEY,
  api_secret: CLOUDINARY_API_SECRET,
});

// ✅ Optional Debug Logging
if (process.env.NODE_ENV !== "production") {
  console.log("✅ Cloudinary connected to:", CLOUDINARY_CLOUD_NAME);
}

// ✅ Helper: Delete media from Cloudinary
const deleteFromCloudinary = async (publicId, resourceType = "image") => {
  try {
    const result = await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
    return result;
  } catch (error) {
    console.error("❌ Cloudinary delete error:", error.message);
    throw error;
  }
};

module.exports = {
  cloudinary,
  deleteFromCloudinary
};
