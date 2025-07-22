const mongoose = require("mongoose");
const Message = require("../models/Message");
const Conversation = require("../models/Conversation");

// ─────────────────────────────────────────────
// ✅ Create or Get a Conversation Between Two Users
// Route: POST /api/messages/conversation
// ─────────────────────────────────────────────
exports.createConversation = async (req, res) => {
  try {
    const { otherUserId } = req.body;

    if (!otherUserId || !mongoose.Types.ObjectId.isValid(otherUserId)) {
      return res.status(400).json({ message: "Invalid or missing other user ID" });
    }

    let conversation = await Conversation.findOne({
      members: { $all: [req.user._id, otherUserId] },
    });

    if (!conversation) {
      conversation = await Conversation.create({
        members: [req.user._id, otherUserId],
      });
    }

    res.status(200).json(conversation);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────
// ✅ Send a Message (Text, Image, or Media)
// Route: POST /api/messages/send
// ─────────────────────────────────────────────
exports.sendMessage = async (req, res) => {
  try {
    let { receiverId, message, mediaUrl, chat, replyTo, type } = req.body;

    if (!receiverId && !chat) {
      return res.status(400).json({ message: "Receiver ID or Chat ID is required" });
    }

    if (!message && !mediaUrl) {
      return res.status(400).json({ message: "Message text or media is required" });
    }

    if (chat && mongoose.Types.ObjectId.isValid(chat)) {
      chat = new mongoose.Types.ObjectId(chat);
    } else if (chat) {
      return res.status(400).json({ message: "Invalid Chat ID" });
    }

    if (replyTo && mongoose.Types.ObjectId.isValid(replyTo)) {
      replyTo = new mongoose.Types.ObjectId(replyTo);
    }

    let conversation = null;

    if (!receiverId && chat) {
      conversation = await Conversation.findById(chat);
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }
    }

    if (!chat && receiverId) {
      conversation = await Conversation.findOne({
        members: { $all: [req.user._id, receiverId] },
      });

      if (!conversation) {
        conversation = await Conversation.create({
          members: [req.user._id, receiverId],
        });
      }

      chat = conversation._id;
    }

    const finalReceiverId = receiverId || conversation.members.find(
      id => id.toString() !== req.user._id.toString()
    );

    const newMessage = await Message.create({
      senderId: req.user._id,
      receiverId: finalReceiverId,
      message,
      mediaUrl: mediaUrl || "",
      chat,
      replyTo: replyTo || null,
      type: type || (mediaUrl ? "image" : "text"),
    });

    await Conversation.findByIdAndUpdate(chat, {
      lastMessage: message || "📎 Media",
      updatedAt: Date.now(),
    });

    res.status(201).json(newMessage);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────
// ✅ Get All Messages in a Chat
// Route: GET /api/messages/chat/:conversationId
// ─────────────────────────────────────────────
exports.getMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return res.status(400).json({ message: "Invalid conversation ID" });
    }

    const messages = await Message.find({ chat: conversationId })
      .sort({ createdAt: 1 })
      .populate("senderId", "username email pic")
      .populate("receiverId", "username email pic")
      .populate("replyTo")
      .populate("chat");

    res.status(200).json(messages);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────
// ✅ Get All Conversations of Current User
// Route: GET /api/messages/conversation/all
// ─────────────────────────────────────────────
exports.getUserConversations = async (req, res) => {
  try {
    const conversations = await Conversation.find({
      members: req.user._id,
    })
      .sort({ updatedAt: -1 })
      .populate("members", "-password")
      .populate("lastMessage");

    res.status(200).json(conversations);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────
// ✅ Mark Message as Seen
// Route: PUT /api/messages/seen/:messageId
// ─────────────────────────────────────────────
exports.markMessageAsSeen = async (req, res) => {
  try {
    const { messageId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(messageId)) {
      return res.status(400).json({ message: "Invalid message ID" });
    }

    const message = await Message.findByIdAndUpdate(
      messageId,
      { seen: true },
      { new: true }
    );

    if (!message) {
      return res.status(404).json({ message: "Message not found" });
    }

    res.status(200).json({ message: "Marked as seen", data: message });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────
// ✅ Delete Message
// Route: DELETE /api/messages/:messageId
// ─────────────────────────────────────────────
exports.deleteMessage = async (req, res) => {
  try {
    const { messageId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(messageId)) {
      return res.status(400).json({ message: "Invalid message ID" });
    }

    const deleted = await Message.findByIdAndDelete(messageId);
    if (!deleted) {
      return res.status(404).json({ message: "Message not found" });
    }

    res.status(200).json({ message: "Message deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────
// ✅ Reply to a Message
// Route: POST /api/messages/reply/:messageId
// ─────────────────────────────────────────────
exports.replyToMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { message, chat, mediaUrl, type } = req.body;

    if (!mongoose.Types.ObjectId.isValid(messageId)) {
      return res.status(400).json({ message: "Invalid message ID to reply to" });
    }

    const originalMessage = await Message.findById(messageId);
    if (!originalMessage) {
      return res.status(404).json({ message: "Original message not found" });
    }

    const newMessage = await Message.create({
      senderId: req.user._id,
      receiverId: originalMessage.senderId,
      message,
      chat: originalMessage.chat || chat,
      replyTo: messageId,
      mediaUrl: mediaUrl || "",
      type: type || "text",
    });

    res.status(201).json(newMessage);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
