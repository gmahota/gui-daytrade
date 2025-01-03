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
  "USDJPY=X": {
    upperLimit: 150,
    lowerLimit: 140,
    historicalPrices: {},
    fetchType: "currency",
    intervals: ["1d", "4h", "15m"],
  },
  "XAUUSD=X": {
    upperLimit: 2000,
    lowerLimit: 1800,
    historicalPrices: {},
    fetchType: "commodity",
    intervals: ["1d", "15m"],
  },
  "^DJI": {
    upperLimit: 35000,
    lowerLimit: 34000,
    historicalPrices: {},
    fetchType: "index",
    intervals: ["1d", "15m"],
  },
  "CL=F": {
    upperLimit: 80,
    lowerLimit: 70,
    historicalPrices: {},
    fetchType: "commodity",
    intervals: ["1d", "15m"],
  },
};

const fetchHistoricalPrices = async (symbol, interval) => {
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

    return result.quotes.map((entry) => entry.close);
  } catch (error) {
    throw new Error(
      `Erro ao buscar dados históricos para ${symbol}: ${error.message}`
    );
  }
};

const fetchPrice = async (symbol) => {
  try {
    const quote = await yahooFinance.quote(symbol);
    return quote.regularMarketPrice;
  } catch (error) {
    throw new Error(
      `Erro ao buscar preço atual para ${symbol}: ${error.message}`
    );
  }
};

export const monitorForexCommodities = async () => {
  try {
    for (const [symbol, config] of Object.entries(monitoredForexCommodities)) {
      for (const interval of config.intervals) {
        if (!config.historicalPrices[interval]) {
          console.log(
            `Buscando histórico de preços (${interval}) para ${symbol}...`
          );
          config.historicalPrices[interval] = await fetchHistoricalPrices(
            symbol,
            interval
          );
        }

        const currentPrice = parseFloat(
          config.historicalPrices[interval][ config.historicalPrices[interval].length - 1]).toFixed(4); 

        config.historicalPrices[interval].push(currentPrice);
        if (config.historicalPrices[interval].length > 50) {
          config.historicalPrices[interval].shift();
        }

        console.log(`Preço atual de ${symbol} (${interval}): $${currentPrice}`);

        // Calcular Indicadores (MACD, Bollinger, ATR)
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

        // Alertas
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
      }
    }

  } catch (error) {
    console.error("Erro ao monitorar Forex e Commodities:", error);
  }
};

export default monitoredForexCommodities; // Exporta o objeto para consulta
