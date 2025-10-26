// routes/moderationRoutes.js
import express from "express";
import multer from "multer";
import { checkImage } from "../services/moderationService.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } }); // 2MB preview

// POST /moderation/image  (field name: image)
router.post("/image", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ allowed: false, reason: "No file" });
    const out = await checkImage(req.file.buffer);
    if (out.allowed) return res.json({ allowed: true, reason: "OK" });
    return res.status(400).json({ allowed: false, reason: out.reason || "Rejected" });
  } catch (err) {
    console.error("[/moderation/image] error", err?.response?.data || err);
    return res.status(500).json({ allowed: false, reason: "Moderation failed" });
  }
});

export default router;
