const express = require("express");
const router = express.Router();
const {
  accessChat,
  fetchChats,
  sendMessage,
  allMessages,
} = require("../controllers/chatController");

const auth = require("../middleware/index");

// Start or get a chat
router.post("/access", auth, accessChat);

// Fetch all user's chats
router.get("/", auth, fetchChats);

// Send a message
router.post("/message", auth, sendMessage);

// Get all messages in a chat
router.get("/message/:chatId", auth, allMessages);

module.exports = router;
