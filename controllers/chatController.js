// backend/controllers/chatController.js
const Conversation = require("../models/Conversation");
const User = require("../models/User");

// Create a new conversation or return existing one
exports.createOrGetConversation = async (req, res) => {
  try {
    const { senderId, receiverId } = req.body;

    let conversation = await Conversation.findOne({
      members: { $all: [senderId, receiverId] },
    });

    if (!conversation) {
      conversation = await Conversation.create({
        members: [senderId, receiverId],
        messages: [],
      });
    }

    res.status(200).json(conversation);
  } catch (err) {
    res.status(500).json({ error: "Server Error", details: err.message });
  }
};

// Send a message in a conversation
exports.sendMessage = async (req, res) => {
  try {
    const { conversationId, senderId, message, mediaUrl } = req.body;

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    const newMessage = {
      senderId,
      message,
      mediaUrl,
      timestamp: new Date(),
    };

    conversation.messages.push(newMessage);
    await conversation.save();

    res.status(200).json({ success: true, message: newMessage });
  } catch (err) {
    res.status(500).json({ error: "Message sending failed", details: err.message });
  }
};

// Get all conversations of a user
exports.getUserConversations = async (req, res) => {
  try {
    const { userId } = req.params;

    const conversations = await Conversation.find({
      members: { $in: [userId] },
    }).sort({ updatedAt: -1 });

    res.status(200).json(conversations);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch conversations", details: err.message });
  }
};

// Get messages from a specific conversation
exports.getMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    res.status(200).json(conversation.messages);
  } catch (err) {
    res.status(500).json({ error: "Failed to get messages", details: err.message });
  }
};
