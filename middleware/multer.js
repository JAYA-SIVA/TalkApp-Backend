// middleware/multer.js

const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("../config/cloudinary");

// ✅ Configure Cloudinary storage
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    const ext = file.mimetype.split("/")[1];

    return {
      folder: "talk-app",
      resource_type: "auto",
      public_id: `${Date.now()}-${file.originalname}`,
      format: ext
    };
  },
});

// ✅ Multer middleware using Cloudinary storage
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // Max 100MB
  },
  fileFilter: (req, file, cb) => {
    const isImage = file.mimetype.startsWith("image/");
    const isVideo = file.mimetype.startsWith("video/");
    
    if (isImage || isVideo) {
      cb(null, true);
    } else {
      cb(new Error("❌ Only image and video files are allowed!"), false);
    }
  },
});

module.exports = upload;
