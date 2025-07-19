// backend/controllers/reels.js
const Post = require("../models/Post");
const User = require("../models/User");
const cloudinary = require("cloudinary").v2;

// Upload a new reel (short video)
exports.uploadReel = async (req, res) => {
  try {
    const { caption, userId } = req.body;
    const video = req.file?.path;

    if (!video) {
      return res.status(400).json({ error: "Video file is required" });
    }

    // Upload to Cloudinary
    const result = await cloudinary.uploader.upload(video, {
      resource_type: "video",
      folder: "reels",
    });

    // Save reel as a post with video type
    const newReel = await Post.create({
      caption,
      mediaUrl: result.secure_url,
      mediaType: "video",
      postedBy: userId,
      likes: [],
      comments: [],
    });

    res.status(201).json({ message: "Reel uploaded successfully", reel: newReel });
  } catch (err) {
    res.status(500).json({ error: "Failed to upload reel", details: err.message });
  }
};

// Get all reels
exports.getAllReels = async (req, res) => {
  try {
    const reels = await Post.find({ mediaType: "video" })
      .populate("postedBy", "username profilePic")
      .sort({ createdAt: -1 });

    res.status(200).json(reels);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch reels", details: err.message });
  }
};

// Delete a reel (by the owner)
exports.deleteReel = async (req, res) => {
  try {
    const { postId, userId } = req.body;

    const reel = await Post.findById(postId);

    if (!reel) return res.status(404).json({ error: "Reel not found" });

    if (reel.postedBy.toString() !== userId) {
      return res.status(403).json({ error: "Not authorized to delete this reel" });
    }

    await reel.deleteOne();
    res.status(200).json({ message: "Reel deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete reel", details: err.message });
  }
};
