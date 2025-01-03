import express from "express";
import { getBTCPrice } from "../services/binance.js";

const router = express.Router();

// Route to fetch BTC price
router.get("/price", async (req, res) => {
  try {
    const price = await getBTCPrice();
    res.json({ success: true, price });
  } catch (error) {
    console.error("Error fetching BTC price:", error);
    res
      .status(500)
      .json({ success: false, error: "Failed to fetch BTC price" });
  }
});

export default router;
