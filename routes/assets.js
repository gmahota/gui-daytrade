import express from "express";
import monitoredCryptos from "../services/CryptoMonitor.js";

const router = express.Router();

// Atualizar limites para uma moeda
router.post("/set", (req, res) => {
  const { symbol, upperLimit, lowerLimit } = req.body;

  if (!symbol || upperLimit === undefined || lowerLimit === undefined) {
    return res
      .status(400)
      .json({
        success: false,
        message: "Forneça symbol, upperLimit e lowerLimit.",
      });
  }

  monitoredCryptos[symbol] = {
    ...monitoredCryptos[symbol],
    upperLimit,
    lowerLimit,
  };

  res.json({ success: true, message: `Limites atualizados para ${symbol}!` });
});

export default router;