const cloudinary = require("../config/cloudinary");
const Story = require("../models/Story");

// ✅ Upload a new story (image or video)
const uploadStory = async (req, res) => {
  try {
    const file = req.file;
    const { caption } = req.body;

    if (!file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const fileType = file.mimetype.startsWith("video") ? "video" : "image";

    const result = await cloudinary.uploader.upload(file.path, {
      resource_type: fileType === "video" ? "video" : "image",
      folder: "stories",
    });

    const story = await Story.create({
      userId: req.user._id,
      mediaUrl: result.secure_url,
      caption,
      type: fileType,
    });

    res.status(201).json({
      message: "Story uploaded successfully",
      story,
    });
  } catch (err) {
    console.error("❌ Upload Story Error:", err.message);
    return res.status(500).json({ message: err.message });
  }
};

// ✅ Get all stories (non-expired assumed via TTL)
const getAllStories = async (req, res) => {
  try {
    const stories = await Story.find()
      .sort({ createdAt: -1 })
      .populate("userId", "username profilePic");

    res.status(200).json(stories);
  } catch (err) {
    console.error("❌ Get Stories Error:", err.message);
    res.status(500).json({ message: err.message });
  }
};

// ✅ Mark a story as viewed
const viewStory = async (req, res) => {
  try {
    const story = await Story.findById(req.params.id);
    if (!story) {
      return res.status(404).json({ message: "Story not found" });
    }

    if (!story.views.includes(req.user._id)) {
      story.views.push(req.user._id);
      await story.save();
    }

    res.json({ message: "Story viewed" });
  } catch (err) {
    console.error("❌ View Story Error:", err.message);
    res.status(500).json({ message: err.message });
  }
};

// ✅ Delete a story (with Cloudinary cleanup)
const deleteStory = async (req, res) => {
  try {
    const story = await Story.findById(req.params.id);
    if (!story) {
      return res.status(404).json({ message: "Story not found" });
    }

    if (story.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Unauthorized to delete" });
    }

    // ✅ Cloudinary delete
    const publicId = story.mediaUrl.split("/").pop().split(".")[0];
    await cloudinary.uploader.destroy(`stories/${publicId}`, {
      resource_type: story.type === "video" ? "video" : "image",
    });

    await story.deleteOne();
    res.json({ message: "Story deleted successfully" });
  } catch (err) {
    console.error("❌ Delete Story Error:", err.message);
    res.status(500).json({ message: err.message });
  }
};

// ✅ Export all
module.exports = {
  uploadStory,
  getAllStories,
  viewStory,
  deleteStory,
};
