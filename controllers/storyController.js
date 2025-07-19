// backend/controllers/storyController.js
const Story = require("../models/Story");
const cloudinary = require("cloudinary").v2;

// Upload a new story (Click)
exports.uploadStory = async (req, res) => {
  try {
    const { userId } = req.body;
    const file = req.file?.path;

    if (!file) {
      return res.status(400).json({ error: "Media file is required" });
    }

    // Upload to Cloudinary
    const result = await cloudinary.uploader.upload(file, {
      folder: "clicks",
      resource_type: "auto", // supports image & video
    });

    const newStory = await Story.create({
      userId,
      mediaUrl: result.secure_url,
      mediaType: result.resource_type.startsWith("video") ? "video" : "image",
    });

    res.status(201).json({ message: "Click uploaded successfully", story: newStory });
  } catch (error) {
    res.status(500).json({ error: "Upload failed", details: error.message });
  }
};

// Get all active Clicks (last 24 hours)
exports.getStories = async (req, res) => {
  try {
    const timeLimit = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago

    const stories = await Story.find({ createdAt: { $gte: timeLimit } })
      .sort({ createdAt: -1 })
      .populate("userId", "username profilePic");

    res.status(200).json(stories);
  } catch (error) {
    res.status(500).json({ error: "Fetching Clicks failed", details: error.message });
  }
};

// Delete a Click (story)
exports.deleteStory = async (req, res) => {
  try {
    const { storyId, userId } = req.body;

    const story = await Story.findById(storyId);
    if (!story) return res.status(404).json({ error: "Click not found" });

    if (story.userId.toString() !== userId) {
      return res.status(403).json({ error: "Unauthorized action" });
    }

    await story.deleteOne();
    res.status(200).json({ message: "Click deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: "Delete failed", details: error.message });
  }
};
