// middleware/multer.js

const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const { cloudinary } = require("../config/cloudinary");
const path = require("path");

// ✅ Configure Cloudinary storage with auto resource type
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    const ext = path.extname(file.originalname).slice(1); // e.g., 'jpg', 'mp4'

    return {
      folder: "talk-app",
      resource_type: "auto", // auto-detect (image/video)
      public_id: `${Date.now()}-${file.originalname.replace(/\s/g, "_")}`,
      format: ext
    };
  },
});

// ✅ Multer setup
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // Max 100MB
  },
  fileFilter: (req, file, cb) => {
    const allowed = ["image/", "video/"];
    const isValid = allowed.some(type => file.mimetype.startsWith(type));
    
    if (isValid) {
      cb(null, true);
    } else {
      cb(new Error("❌ Only image and video files are allowed!"));
    }
  },
});

module.exports = upload;
