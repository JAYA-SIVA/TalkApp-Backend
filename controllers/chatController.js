const mongoose = require("mongoose");
const Chat = require("../models/Chat");
const Message = require("../models/Message");
const User = require("../models/User");

// ─────────────────────────────────────────────
// ✅ 1. Access or Create One-to-One Chat
// ─────────────────────────────────────────────
exports.accessChat = async (req, res) => {
  const { userId } = req.body;

  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    return res.status(400).json({ error: "Invalid or missing userId" });
  }

  try {
    // 🔍 Find existing one-to-one chat
    let chat = await Chat.findOne({
      isGroupChat: false,
      users: { $all: [req.user._id, userId] },
    })
      .populate("users", "-password")
      .populate("latestMessage");

    if (chat) {
      chat = await User.populate(chat, {
        path: "latestMessage.sender",
        select: "name email pic",
      });
      return res.status(200).json(chat);
    }

    // 🚀 Create new chat
    const newChat = await Chat.create({
      chatName: "sender",
      isGroupChat: false,
      users: [req.user._id, userId],
    });

    const fullChat = await Chat.findById(newChat._id)
      .populate("users", "-password");

    return res.status(201).json(fullChat);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

// ─────────────────────────────────────────────
// ✅ 2. Fetch All Chats for Logged-In User
// ─────────────────────────────────────────────
exports.fetchChats = async (req, res) => {
  try {
    let chats = await Chat.find({
      users: { $in: [req.user._id] },
    })
      .populate("users", "-password")
      .populate("latestMessage")
      .sort({ updatedAt: -1 });

    chats = await User.populate(chats, {
      path: "latestMessage.sender",
      select: "name email pic",
    });

    return res.status(200).json(chats);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

// ─────────────────────────────────────────────
// ✅ 3. Fetch All Messages in a Chat
// ─────────────────────────────────────────────
exports.allMessages = async (req, res) => {
  const chatId = req.params.chatId;

  if (!mongoose.Types.ObjectId.isValid(chatId)) {
    return res.status(400).json({ error: "Invalid chat ID" });
  }

  try {
    const messages = await Message.find({ chat: chatId })
      .populate("sender", "name pic email")
      .populate("chat");

    return res.status(200).json(messages);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

// ─────────────────────────────────────────────
// ✅ 4. Send Message to a Chat
// ─────────────────────────────────────────────
exports.sendMessage = async (req, res) => {
  const { content, chatId } = req.body;

  if (!content || !chatId || !mongoose.Types.ObjectId.isValid(chatId)) {
    return res.status(400).json({ error: "Valid content and chatId are required" });
  }

  try {
    const newMessage = new Message({
      sender: req.user._id,
      content,
      chat: chatId,
    });

    let message = await newMessage.save();

    message = await message
      .populate("sender", "name pic")
      .populate("chat");

    message = await User.populate(message, {
      path: "chat.users",
      select: "name pic email",
    });

    await Chat.findByIdAndUpdate(chatId, {
      latestMessage: message,
    });

    return res.status(201).json(message);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
