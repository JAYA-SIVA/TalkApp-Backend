const express = require("express");
const router = express.Router();
const {
  createOrGetConversation,
  sendMessage,
  getUserConversations,
  getMessages,
} = require("../controllers/chatController");
const { ensureAuthenticated } = require("../middleware");

// ✅ Create or get a conversation between two users
router.post("/conversation", ensureAuthenticated, createOrGetConversation);

// ✅ Send a new message in a conversation
router.post("/message", ensureAuthenticated, sendMessage);

// ✅ Get all conversations for a user
router.get("/conversations/:userId", ensureAuthenticated, getUserConversations);

// ✅ Get all messages for a conversation
router.get("/messages/:conversationId", ensureAuthenticated, getMessages);

module.exports = router;
