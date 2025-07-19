const mongoose = require("mongoose");

// Schema for individual messages
const messageSchema = new mongoose.Schema({
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  message: {
    type: String,
    default: "",
  },
  mediaUrl: {
    type: String,
    default: "", // For images/videos
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
});

// Schema for the conversation
const conversationSchema = new mongoose.Schema(
  {
    members: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    messages: [messageSchema],
  },
  { timestamps: true } // Automatically adds createdAt and updatedAt
);

module.exports = mongoose.model("Conversation", conversationSchema);
