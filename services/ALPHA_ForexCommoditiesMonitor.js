import axios from "axios";
import { MACD, BollingerBands, ATR } from "technicalindicators";
import { sendMessage } from "./whatsapp.js";
import { sendTelegramMessage } from "./telegram.js";

let monitoredForexCommodities = {
  EURUSD: {
    upperLimit: 1.2,
    lowerLimit: 1.1,
    historicalPrices: {},
    fetchType: "currency",
    intervals: ["1d", "15min"],
  },
  USDJPY: {
    upperLimit: 150,
    lowerLimit: 140,
    historicalPrices: {},
    fetchType: "currency",
    intervals: ["1d", "4h", "15min"],
  },
  XAUUSD: {
    upperLimit: 2000,
    lowerLimit: 1800,
    historicalPrices: {},
    fetchType: "commodity",
    intervals: ["1d", "15min"],
  },
  US30: {
    upperLimit: 35000,
    lowerLimit: 34000,
    historicalPrices: {},
    fetchType: "index",
    intervals: ["1d", "15min"],
  },
  CRUDEOIL: {
    upperLimit: 80,
    lowerLimit: 70,
    historicalPrices: {},
    fetchType: "commodity",
    intervals: ["1d", "15min"],
  },
};

const fetchHistoricalPrices = async (symbol, fetchType, interval) => {
  const apiKey = process.env.ALPHA_VANTAGE_KEY;

  // Escolher o endpoint com base no intervalo
  let endpoint;
  if (interval === "1d") {
    endpoint = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${symbol}&apikey=${apiKey}`;
  } else if (interval === "1w") {
    endpoint = `https://www.alphavantage.co/query?function=TIME_SERIES_WEEKLY&symbol=${symbol}&apikey=${apiKey}`;
  } else if (interval === "1mo") {
    endpoint = `https://www.alphavantage.co/query?function=TIME_SERIES_MONTHLY&symbol=${symbol}&apikey=${apiKey}`;
  } else if (["1min", "5min", "15min", "30min", "60min"].includes(interval)) {
    endpoint = `https://www.alphavantage.co/query?function=TIME_SERIES_INTRADAY&symbol=${symbol}&interval=${interval}&apikey=${apiKey}`;
  } else {
    throw new Error(`Intervalo1 ${interval} não suportado para ${symbol}`);
  }

  console.log(endpoint);
  const response = await axios.get(endpoint);

  const dataKey = Object.keys(response.data).find((key) =>
    key.includes("Time Series")
  );
  if (!dataKey) {
    throw new Error(`Intervalo2 ${interval} não suportado para ${symbol}`);
  }

  const prices = response.data[dataKey];
  return Object.keys(prices).map((date) =>
    parseFloat(prices[date]["4. close"])
  );
};



const fetchPrice = async (symbol, fetchType) => {
  const apiKey = process.env.ALPHA_VANTAGE_KEY;

  const endpoints = {
    currency: `https://www.alphavantage.co/query?function=CURRENCY_EXCHANGE_RATE&from_currency=${symbol.slice(
      0,
      3
    )}&to_currency=${symbol.slice(3)}&apikey=${apiKey}`,
    commodity: `https://www.alphavantage.co/query?function=COMMODITY_EXCHANGE_RATE&symbol=${symbol}&apikey=${apiKey}`,
    index: `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${apiKey}`,
  };

  const response = await axios.get(endpoints[fetchType]);
  if (fetchType === "currency") {
    return parseFloat(
      response.data["Realtime Currency Exchange Rate"]["5. Exchange Rate"]
    );
  } else if (fetchType === "commodity") {
    return parseFloat(
      response.data["Realtime Commodity Exchange Rate"]["5. Exchange Rate"]
    );
  } else if (fetchType === "index") {
    return parseFloat(response.data["Global Quote"]["05. price"]);
  }

  throw new Error(`Fetch type ${fetchType} não suportado para ${symbol}`);
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
            config.fetchType,
            interval
          );
        }

        const currentPrice = await fetchPrice(symbol, config.fetchType);
        config.historicalPrices[interval].push(currentPrice);
        if (config.historicalPrices[interval].length > 50)
          config.historicalPrices[interval].shift();

        console.log(`Preço atual de ${symbol} (${interval}): $${currentPrice}`);
      }
    }
  } catch (error) {
    console.error("Erro ao monitorar Forex e Commodities:", error);
  }
};


export default monitoredForexCommodities; // Exporta o objeto para consulta
