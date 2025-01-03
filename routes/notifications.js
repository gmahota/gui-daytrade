import express from "express";
import { sendMessage } from "../services/whatsapp.js";
import { sendTelegramMessage } from "../services/telegram.js";

const router = express.Router();

router.post("/send", async (req, res) => {
  const { platform, target, message } = req.body;

  try {
    if (platform === "whatsapp") {
      await sendMessage(target, message);
    } else if (platform === "telegram") {
      await sendTelegramMessage(target, message);
    }
    res.json({ success: true, message: "Notification sent successfully!" });
  } catch (error) {
    console.error("Error sending notification:", error);
    res
      .status(500)
      .json({ success: false, error: "Failed to send notification" });
  }
});

export default router;
