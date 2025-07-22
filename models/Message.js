const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    // 👤 Sender of the message
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Sender ID is required"],
    },

    // 🎯 Receiver of the message (for 1-to-1 chat only)
    receiverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Receiver ID is required"],
    },

    // 🗨️ Text message content
    message: {
      type: String,
      trim: true,
      default: "",
    },

    // 📎 Media (image/video/audio/file) - optional
    mediaUrl: {
      type: String,
      default: "",
    },

    // 👁️ Seen status (message viewed or not)
    seen: {
      type: Boolean,
      default: false,
    },

    // 💬 Chat ID for group or thread reference
    chat: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Chat",
      default: null,
    },

    // 🔁 Reply-to Message ID (for threading)
    replyTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
      default: null,
    },

    // 🔠 Message type (text/image/video/audio/file)
    type: {
      type: String,
      enum: ["text", "image", "video", "audio", "file"],
      default: "text",
    },
  },
  {
    timestamps: true, // Automatically adds createdAt & updatedAt
  }
);

module.exports = mongoose.model("Message", messageSchema);
