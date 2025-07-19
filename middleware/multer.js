// backend/middleware/multer.js
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");
const path = require("path");
const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");

// Cloudinary config (ensure .env has correct values)
cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_API_KEY,
  api_secret: process.env.CLOUD_API_SECRET,
});

// Define Cloudinary storage
const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    let folder = "uploads";

    // Optional logic to detect folder
    if (req.originalUrl.includes("/reels")) folder = "reels";
    else if (req.originalUrl.includes("/story")) folder = "stories";
    else if (req.originalUrl.includes("/talk")) folder = "posts";
    else if (req.originalUrl.includes("/profile")) folder = "profiles";

    return {
      folder,
      resource_type: "auto", // Automatically detects image or video
      public_id: uuidv4() + path.extname(file.originalname),
    };
  },
});

// Multer upload middleware
const upload = multer({ storage });

module.exports = upload;
