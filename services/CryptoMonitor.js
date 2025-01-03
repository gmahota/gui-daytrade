import axios from "axios";
import { MACD, BollingerBands, ATR } from "technicalindicators";
import { sendMessage } from "./whatsapp.js";
import { sendTelegramMessage } from "./telegram.js";

let monitoredCryptos = {
  BTCUSDT: {
    upperLimit: 79600,
    lowerLimit: 77000,
    historicalPrices: {},
    intervals: ["1d", "4h"],
  },
  ETHUSDT: {
    upperLimit: 3500,
    lowerLimit: 3400,
    historicalPrices: {},
    intervals: ["1d", "1h"],
  },
  XRPUSDT: {
    upperLimit: 0.55,
    lowerLimit: 0.5,
    historicalPrices: {},
    intervals: ["1d", "1m"],
  },
};

export const setCryptoLimits = (symbol, upperLimit, lowerLimit) => {
  monitoredCryptos[symbol] = {
    ...monitoredCryptos[symbol],
    upperLimit,
    lowerLimit,
  };
  console.log(
    `Configurações atualizadas para ${symbol}:`,
    monitoredCryptos[symbol]
  );
};

const fetchCryptoPrice = async (symbol) => {
  const response = await axios.get(
    `https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`
  );
  return parseFloat(response.data.price);
};

const fetchHistoricalPricesBinance = async (symbol, interval, limit = 50) => {
  const response = await axios.get(
    `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
  );

  return response.data.map((candle) => ({
    time: new Date(candle[0]),
    open: parseFloat(candle[1]),
    high: parseFloat(candle[2]),
    low: parseFloat(candle[3]),
    close: parseFloat(candle[4]),
    volume: parseFloat(candle[5]),
  }));
};

const fetchAllHistoricalPrices = async (symbols, interval) => {
  try {
    const promises = symbols.map((symbol) =>
      fetchHistoricalPricesBinance(symbol, interval)
    );
    const results = await Promise.all(promises);

    return symbols.reduce((acc, symbol, index) => {
      acc[symbol] = results[index].map((candle) => candle.close);
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

export const monitorCryptos = async () => {
  try {
    const symbolsByInterval = {};
    for (const [symbol, config] of Object.entries(monitoredCryptos)) {
      for (const interval of config.intervals) {
        if (!symbolsByInterval[interval]) symbolsByInterval[interval] = [];
        symbolsByInterval[interval].push(symbol);
      }
    }

    for (const [interval, symbols] of Object.entries(symbolsByInterval)) {
      console.log(`Buscando histórico de preços (${interval}) para símbolos:`, symbols);

      const prices = await fetchAllHistoricalPrices(symbols, interval);

      symbols.forEach(async (symbol) => {
        const config = monitoredCryptos[symbol];
        if (!config.historicalPrices[interval]) {
          config.historicalPrices[interval] = [];
        }

        config.historicalPrices[interval].push(...prices[symbol]);

        if (config.historicalPrices[interval].length > 50)
          config.historicalPrices[interval] = config.historicalPrices[interval].slice(-50);

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
    console.error("Erro ao monitorar criptomoedas:", error);
  }
};

export default monitoredCryptos;