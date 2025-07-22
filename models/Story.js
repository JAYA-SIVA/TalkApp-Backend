// models/Story.js

const mongoose = require("mongoose");

const storySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User", // Reference to User model
      required: true,
    },
    mediaUrl: {
      type: String, // Cloudinary URL of image or video
      required: true,
    },
    type: {
      type: String,
      enum: ["image", "video"], // Accepted types
      required: true,
    },
    caption: {
      type: String,
      default: "", // Optional caption
    },
    views: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User", // Users who viewed the story
      },
    ],
    createdAt: {
      type: Date,
      default: Date.now,
      expires: 86400, // 🕒 TTL index: 24 hours = 60*60*24 = 86400s
    },
  },
  {
    timestamps: true, // Adds createdAt & updatedAt
  }
);

module.exports = mongoose.model("Story", storySchema);
