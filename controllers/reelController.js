const mongoose = require("mongoose");
const cloudinary = require("../config/cloudinary");
const Reel = require("../models/reel");

// ✅ Upload a new reel
exports.uploadReel = async (req, res) => {
  try {
    if (!req.file || !req.body.caption) {
      return res.status(400).json({ message: "Video file and caption are required" });
    }

    // Upload video to Cloudinary
    const result = await cloudinary.uploader.upload(req.file.path, {
      resource_type: "video",
      folder: "reels",
    });

    const userId = (req.user && req.user._id) || req.body.userid;

    // Save to database
    const reel = await Reel.create({
      userId,
      videoUrl: result.secure_url,
      caption: req.body.caption,
    });

    res.status(201).json({
      message: "Reel uploaded successfully",
      reel,
    });
  } catch (err) {
    console.error("Upload Error:", err);
    res.status(500).json({ message: err.message || "Server error" });
  }
};

// ✅ Get all reels
exports.getAllReels = async (req, res) => {
  try {
    const reels = await Reel.find()
      .sort({ createdAt: -1 })
      .populate("userId", "username profilePic")
      .populate("comments.user", "username profilePic")
      .populate("likes", "username profilePic");

    res.status(200).json(reels);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ✅ Like a reel
exports.likeReel = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid Reel ID" });
    }

    const reel = await Reel.findById(id);
    if (!reel) return res.status(404).json({ message: "Reel not found" });

    if (!reel.likes.includes(req.user._id)) {
      reel.likes.push(req.user._id);
      await reel.save();
    }

    const updated = await Reel.findById(id).populate("likes", "username profilePic");
    res.status(200).json({ message: "Reel liked", likes: updated.likes });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ✅ Dislike (Unlike) a reel
exports.dislikeReel = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid Reel ID" });
    }

    const reel = await Reel.findById(id);
    if (!reel) return res.status(404).json({ message: "Reel not found" });

    reel.likes = reel.likes.filter(
      userId => userId.toString() !== req.user._id.toString()
    );

    await reel.save();

    const updated = await Reel.findById(id).populate("likes", "username profilePic");
    res.status(200).json({ message: "Reel unliked", likes: updated.likes });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ✅ Comment on a reel
exports.commentReel = async (req, res) => {
  try {
    const { id } = req.params;
    const { text } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid Reel ID" });
    }

    if (!text || text.trim().length === 0) {
      return res.status(400).json({ message: "Comment text is required" });
    }

    const reel = await Reel.findById(id);
    if (!reel) return res.status(404).json({ message: "Reel not found" });

    const newComment = {
      user: req.user._id,
      text: text.trim(),
      createdAt: new Date(),
    };

    reel.comments.push(newComment);
    await reel.save();

    const updated = await Reel.findById(id).populate("comments.user", "username profilePic");
    res.status(201).json({ message: "Comment added", comments: updated.comments });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ✅ Delete a reel (with Cloudinary cleanup)
exports.deleteReel = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid Reel ID" });
    }

    const reel = await Reel.findById(id);
    if (!reel) return res.status(404).json({ message: "Reel not found" });

    if (reel.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    // ✅ Delete video from Cloudinary
    const publicId = reel.videoUrl.split("/").pop().split(".")[0];
    await cloudinary.uploader.destroy(`reels/${publicId}`, { resource_type: "video" });

    await Reel.findByIdAndDelete(id);
    res.status(200).json({ message: "Reel deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
