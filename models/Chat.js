const mongoose = require("mongoose");

const chatSchema = new mongoose.Schema(
  {
    chatName: {
      type: String,
      trim: true,
      default: "", // Optional for 1-to-1 chats
    },

    isGroupChat: {
      type: Boolean,
      default: false,
    },

    users: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
    ],

    latestMessage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
    },

    groupAdmin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User", // Only for group chats
    },
  },
  {
    timestamps: true, // adds createdAt and updatedAt
  }
);

// 🧠 Indexing for faster chat search if needed
chatSchema.index({ users: 1 });

module.exports = mongoose.model("Chat", chatSchema);
