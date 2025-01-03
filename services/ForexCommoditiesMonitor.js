import yahooFinance from "yahoo-finance2";
import { MACD, BollingerBands, ATR } from "technicalindicators";
import { sendMessage } from "./whatsapp.js";
import { sendTelegramMessage } from "./telegram.js";

let monitoredForexCommodities = {
  "EURUSD=X": {
    upperLimit: 1.2,
    lowerLimit: 1.1,
    historicalPrices: {},
    fetchType: "currency",
    intervals: ["1d", "15m"],
  },
  // "USDJPY": {
  //   upperLimit: 150,
  //   lowerLimit: 140,
  //   historicalPrices: {},
  //   fetchType: "currency",
  //   intervals: ["1d", "4h", "15m"],
  // },
  "gold": {
    upperLimit: 2000,
    lowerLimit: 1800,
    historicalPrices: {},
    fetchType: "commodity",
    intervals: ["1d", "15m"],
  },
  // "DJI": {
  //   upperLimit: 35000,
  //   lowerLimit: 34000,
  //   historicalPrices: {},
  //   fetchType: "index",
  //   intervals: ["1d", "15m"],
  // },
  // "CL=F": {
  //   upperLimit: 80,
  //   lowerLimit: 70,
  //   historicalPrices: {},
  //   fetchType: "commodity",
  //   intervals: ["1d", "15m"],
  // },
};

const fetchHistoricalPrices = async (symbol, interval) => {
  try {
    const options = {
      period1: "2025-01-01",
      interval: interval,
      range: interval === "1d" ? "1mo" : "1d",
    };

    const result = await yahooFinance.chart(symbol, options);

    if (!result || !result.meta) {
      throw new Error(`Dados inválidos retornados para ${symbol}`);
    }

    return result.quotes.map((entry) => entry.close);
  } catch (error) {
    throw new Error(
      `Erro ao buscar dados históricos para ${symbol}: ${error.message}`
    );
  }
};

const fetchAllHistoricalPrices = async (symbols, interval) => {
  try {
    const promises = symbols.map((symbol) =>
      fetchHistoricalPrices(symbol, interval)
    );
    const results = await Promise.all(promises);

    return symbols.reduce((acc, symbol, index) => {
      acc[symbol] = results[index];
      return acc;
    }, {});
  } catch (error) {
    console.error(
      `Erro ao buscar históricos para o intervalo ${interval}:`,
      error
    );
    throw error;
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
      console.log(`Buscando histórico de preços (${interval}) para símbolos:`, symbols);

      const prices = await fetchAllHistoricalPrices(symbols, interval);

      symbols.forEach(async (symbol) => {
        const config = monitoredForexCommodities[symbol];
        if (!config.historicalPrices[interval]) {
          config.historicalPrices[interval] = [];
        }

        config.historicalPrices[interval].push(...prices[symbol]);

        if (config.historicalPrices[interval].length > 50) {
          config.historicalPrices[interval] = config.historicalPrices[interval].slice(-50);
        }

        const currentPrice = config.historicalPrices[interval][
          config.historicalPrices[interval].length - 1
        ];

        console.log(`Preço atual de ${symbol} (${interval}): $${currentPrice}`);

        const macd = MACD.calculate({
          values: config.historicalPrices[interval],
          fastPeriod: 12,
          slowPeriod: 26,
          signalPeriod: 9,
          SimpleMAOscillator: false,
          SimpleMASignal: false,
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

        const macdValue = macd[macd.length - 1];
        const bollingerValue = bollinger[bollinger.length - 1];
        const atrValue = atr[atr.length - 1];

        if (macdValue && macdValue.histogram > 0) {
          const alertMessage = `🚨 Alerta: ${symbol} em alta (MACD positivo). Preço atual: $${currentPrice}`;
          await sendMessage(process.env.PhoneAlert, alertMessage);
          await sendTelegramMessage(process.env.GuyChatId, alertMessage);
        }

        if (bollingerValue && currentPrice > bollingerValue.upper) {
          const alertMessage = `⚠️ Alerta: ${symbol} ultrapassou a Banda Superior (Bollinger). Preço atual: $${currentPrice}`;
          await sendMessage(process.env.PhoneAlert, alertMessage);
          await sendTelegramMessage(process.env.GuyChatId, alertMessage);
        }

        if (atrValue && atrValue > config.upperLimit - config.lowerLimit) {
          const alertMessage = `⚠️ Alerta: Alta volatilidade em ${symbol} (ATR elevado). Preço atual: $${currentPrice}`;
          await sendMessage(process.env.PhoneAlert, alertMessage);
          await sendTelegramMessage(process.env.GuyChatId, alertMessage);
        }
      });
    }
  } catch (error) {
    console.error("Erro ao monitorar Forex e Commodities:", error);
  }
};

export default monitoredForexCommodities;
