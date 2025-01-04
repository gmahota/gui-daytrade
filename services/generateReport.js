import fs from "fs";
import { generateCryptoChart } from "./chartGenerator.js";
import { sendTelegramMessage, sendTelegramImage } from "./telegram.js";
import { sendMessage, sendImage } from "./whatsapp.js";

export const generateReport = async (symbolsConfig, interval) => {
  try {
    const reportData = [];

    for (const [symbol, config] of Object.entries(symbolsConfig)) {
      const prices = config.historicalPrices[interval];
      if (!prices || prices.length === 0) continue;

      const maxPrice = Math.max(...prices);
      const minPrice = Math.min(...prices);
      const startPrice = prices[0];
      const endPrice = prices[prices.length - 1];
      const priceChange = ((endPrice - startPrice) / startPrice) * 100;

      const macd = MACD.calculate({
        values: prices,
        fastPeriod: 12,
        slowPeriod: 26,
        signalPeriod: 9,
      });

      const bollinger = BollingerBands.calculate({
        period: 20,
        values: prices,
        stdDev: 2,
      });

      const rsi = RSI.calculate({
        values: prices,
        period: 14,
      });

      // Gera gráficos
      await generateCryptoChart(
        symbol,
        interval,
        { timestamps: config.timestamps[interval] },
        { prices, macd, bollinger, rsi }
      );

      // Prepara dados do relatório
      reportData.push({
        symbol,
        startPrice,
        endPrice,
        maxPrice,
        minPrice,
        priceChange,
        macd: macd[macd.length - 1],
        bollinger: bollinger[bollinger.length - 1],
        rsi: rsi[rsi.length - 1],
        chartPath: `./content/${symbol}_${interval}.png`,
      });
    }

    // Gera explicações e envia relatório
    for (const data of reportData) {
      const explanation = `Relatório para ${data.symbol} (${interval}):
- Preço inicial: $${data.startPrice}
- Preço final: $${data.endPrice}
- Máximo: $${data.maxPrice}
- Mínimo: $${data.minPrice}
- Mudança: ${data.priceChange.toFixed(2)}%
- RSI: ${data.rsi.toFixed(2)}
- MACD: ${JSON.stringify(data.macd)}
- Bollinger Bands: ${JSON.stringify(data.bollinger)}

Gráfico anexado.`;

      // Envia relatório via Telegram e WhatsApp
      await sendTelegramMessage(process.env.GuyChatId, explanation);
      await sendTelegramImage(
        process.env.GuyChatId,
        data.chartPath,
        explanation
      );
      await sendMessage(process.env.PhoneAlert, explanation);
      await sendImage(process.env.PhoneAlert, data.chartPath, explanation);
    }
  } catch (error) {
    console.error("Erro ao gerar relatório:", error);
  }
};
