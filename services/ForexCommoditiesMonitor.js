import yahooFinance from "yahoo-finance2";
import { RSI, MACD, BollingerBands, ATR } from "technicalindicators";
import { sendMessage, sendImage } from "./whatsapp.js";
import { sendTelegramMessage, sendTelegramImage } from "./telegram.js";
import { generateCryptoChart } from "./chartGenerator.js";

let monitoredForexCommodities = {
  "EURUSD=X": {
    upperLimit: 1.2,
    lowerLimit: 1.1,
    historicalPrices: {},
    intervals: ["1d", "15m"],
  },
  "USDJPY=X": {
    upperLimit: 150,
    lowerLimit: 140,
    historicalPrices: {},
    intervals: ["1d", "15m"],
  },
  "gold": {
    upperLimit: 2000,
    lowerLimit: 1800,
    historicalPrices: {},
    intervals: ["1d", "15m"],
  },
  "^DJI": {
    upperLimit: 35000,
    lowerLimit: 34000,
    historicalPrices: {},
    intervals: ["1d", "15m"],
  },
  "CL=F": {
    upperLimit: 80,
    lowerLimit: 70,
    historicalPrices: {},
    intervals: ["1d", "15m"],
  },
};

const fetchHistoricalPricesYahoo = async (symbol, interval) => {
  try {
    const options = {
      period1: "2025-01-01", // 1 ano atrás
      interval: interval, // "1d", "15m", etc.
      range: interval === "1d" ? "1mo" : "1d", // Ajusta o intervalo de busca
    };

    const result = await yahooFinance.chart(symbol, options);

    if (!result || !result.meta) {
      throw new Error(`Dados inválidos retornados para ${symbol}`);
    }

    return result.quotes
      .map((entry) => ({
        time: entry.date,
        open: entry.open,
        high: entry.high,
        low: entry.low,
        close: entry.close,
        volume: entry.volume,
        buyVolume: entry.close >= entry.open ? entry.volume : 0,
        sellVolume: entry.close < entry.open ? entry.volume : 0,
      }))
      .filter((candle) => candle.close !== null && candle.close !== 0);

  } catch (error) {
    throw new Error(
      `Erro ao buscar dados históricos para ${symbol}: ${error.message}`
    );
  }
};

export const monitorForexCommodities = async () => {
  try {
    const symbolsByInterval = {};
    for (const [symbol, config] of Object.entries(monitoredForexCommodities)) {
      for (const interval of config.intervals) {
        if (!symbolsByInterval[interval]) symbolsByInterval[interval] = [];
        symbolsByInterval[interval].push(symbol);
      }
    }

    for (const [interval, symbols] of Object.entries(symbolsByInterval)) {
      console.log(
        `Buscando histórico de preços (${interval}) para símbolos:`,
        symbols
      );

      const historicalData = await Promise.all(
        symbols.map((symbol) => fetchHistoricalPricesYahoo(symbol, interval))
      );

      symbols.forEach(async (symbol, index) => {
        const config = monitoredForexCommodities[symbol];
        const data = historicalData[index];

        if (!config.historicalPrices[interval]) {
          config.historicalPrices[interval] = [];
          config.timestamps = [];
        }

        // Atualiza os preços e timestamps
        config.historicalPrices[interval] = data
          .map((candle) => candle.close);
        config.timestamps[interval] = data.map((candle) => candle.time);

        const currentPrice =
          config.historicalPrices[interval][
            config.historicalPrices[interval].length - 1
          ];

        const maxPrice = Math.max(...config.historicalPrices[interval]);
        const minPrice = Math.min(...config.historicalPrices[interval]);

        console.log(config.timestamps[interval]);

        console.log(`Minimo de ${symbol} (${interval}): $${minPrice}`);

        const avgPrice = (
          config.historicalPrices[interval].reduce((a, b) => a + b, 0) /
          config.historicalPrices[interval].length
        ).toFixed(4);

        const totalBuyVolume = data.reduce(
          (acc, candle) => acc + candle.buyVolume,
          0
        );
        const totalSellVolume = data.reduce(
          (acc, candle) => acc + candle.sellVolume,
          0
        );

        console.log(`Preço atual de ${symbol} (${interval}): $${currentPrice}`);

        const macd = MACD.calculate({
          values: config.historicalPrices[interval],
          fastPeriod: 12,
          slowPeriod: 26,
          signalPeriod: 9,
        });

        const bollinger = BollingerBands.calculate({
          period: 20,
          values: config.historicalPrices[interval],
          stdDev: 2,
        });

        const atr = ATR.calculate({
          high: config.historicalPrices[interval],
          low: config.historicalPrices[interval],
          close: config.historicalPrices[interval],
          period: 14,
        });

        const rsi = RSI.calculate({
          values: config.historicalPrices[interval],
          period: 14,
        });

        // Gerar gráfico com os timestamps e indicadores
        await generateCryptoChart(
          symbol,
          interval,
          {
            timestamps: config.timestamps[interval],
          },
          {
            prices: config.historicalPrices[interval],
            macd,
            bollinger,
            rsi,
          }
        );

        const macdValue = macd[macd.length - 1];
        const bollingerValue = bollinger[bollinger.length - 1];
        const atrValue = atr[atr.length - 1];

        var sendAlert = false;

        if (macdValue && macdValue.histogram > 0) {
          const alertMessage = `🚨 Alerta: ${symbol} em alta (MACD positivo). Preço atual: $${currentPrice}`;
          await sendMessage(process.env.PhoneAlert, alertMessage);
          await sendTelegramMessage(process.env.GuyChatId, alertMessage);

          sendAlert = true;
        }

        if (bollingerValue && currentPrice > bollingerValue.upper) {
          const alertMessage = `⚠️ Alerta: ${symbol} ultrapassou a Banda Superior (Bollinger). Preço atual: $${currentPrice}`;
          await sendMessage(process.env.PhoneAlert, alertMessage);
          await sendTelegramMessage(process.env.GuyChatId, alertMessage);

          sendAlert = true;
        }

        if (atrValue && atrValue > config.upperLimit - config.lowerLimit) {
          const alertMessage = `⚠️ Alerta: Alta volatilidade em ${symbol} (ATR elevado). Preço atual: $${currentPrice}`;
          await sendMessage(process.env.PhoneAlert, alertMessage);
          await sendTelegramMessage(process.env.GuyChatId, alertMessage);

          sendAlert = true;
        }

        if (sendAlert) {
          const imagePath = `./content/${symbol}_${interval}.png`;
          const caption = `📊 Aqui está o gráfico atualizado para ${symbol}. Verifique os indicadores e tendências!`;

          // Gera relatório com detalhes adicionais
          const explanation = `Relatório para ${symbol} (${interval}):
- Preço Atual: $${currentPrice}
- Máximo: $${maxPrice}
- Mínimo: $${minPrice}
- Médio: $${avgPrice}
- Volume Total de Compras: ${totalBuyVolume.toFixed(2)}
- Volume Total de Vendas: ${totalSellVolume.toFixed(2)}
- MACD: ${macdValue?.histogram?.toFixed(2)}
- Bollinger Bands: Superior - $${bollingerValue?.upper?.toFixed(
            2
          )}, Inferior - $${bollingerValue?.lower?.toFixed(2)}
- RSI: ${rsi[rsi.length - 1]?.toFixed(2)}
- ATR: ${atrValue?.toFixed(2)}

Gráfico anexado.`;

          // Enviar via WhatsApp
          await sendImage(process.env.PhoneAlert, imagePath, caption);
          await sendMessage(process.env.PhoneAlert, explanation);

          // Enviar via Telegram
          await sendTelegramImage(process.env.GuyChatId, imagePath, caption);
          await sendTelegramMessage(process.env.GuyChatId, explanation);
        }
      });
    }
  } catch (error) {
    console.error("Erro ao monitorar Forex e Commodities:", error);
  }
};

export default monitoredForexCommodities;
