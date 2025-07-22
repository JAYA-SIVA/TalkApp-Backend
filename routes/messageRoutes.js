const express = require("express");
const router = express.Router();

// ✅ Controllers
const {
  sendMessage,
  getMessages,
  createConversation,
  getUserConversations,
  markMessageAsSeen,
  deleteMessage,
  replyToMessage,
} = require("../controllers/messageController");

// ✅ Middleware
const auth = require("../middleware/auth");

// ────────────────────────────────────────────
// 📩 Send Message
// POST /api/message/send
// Body: { receiverId, message, chat, type, mediaUrl?, replyTo? }
// Protected: YES
// ────────────────────────────────────────────
router.post("/send", auth, sendMessage);

// ────────────────────────────────────────────
// 📥 Get Messages in a Chat
// GET /api/message/chat/:conversationId
// Protected: YES
// ────────────────────────────────────────────
router.get("/chat/:conversationId", auth, getMessages);

// ────────────────────────────────────────────
// 🔗 Create New Conversation
// POST /api/message/conversation
// Body: { otherUserId }
// Protected: YES
// ────────────────────────────────────────────
router.post("/conversation", auth, createConversation);

// ────────────────────────────────────────────
// 📚 Get All Conversations for Logged-in User
// GET /api/message/conversation/all
// Protected: YES
// ────────────────────────────────────────────
router.get("/conversation/all", auth, getUserConversations);

// ────────────────────────────────────────────
// ✅ Mark Message as Seen
// PUT /api/message/seen/:messageId
// Protected: YES
// ────────────────────────────────────────────
router.put("/seen/:messageId", auth, markMessageAsSeen);

// ────────────────────────────────────────────
// ❌ Delete a Message
// DELETE /api/message/:messageId
// Protected: YES
// ────────────────────────────────────────────
router.delete("/:messageId", auth, deleteMessage);

// ────────────────────────────────────────────
// ↩️ Reply to a Message
// POST /api/message/reply/:messageId
// Body: { message, mediaUrl?, chat?, type? }
// Protected: YES
// ────────────────────────────────────────────
router.post("/reply/:messageId", auth, replyToMessage);

module.exports = router;
