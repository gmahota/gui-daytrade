import axios from "axios";
import { RSI, MACD, BollingerBands, ATR } from "technicalindicators";
import { sendMessage, sendImage } from "./whatsapp.js";
import { sendTelegramMessage, sendTelegramImage } from "./telegram.js";
import { generateCryptoChart } from "./chartGenerator.js";

let monitoredCryptos = {
  BTCUSDT: {
    upperLimit: 79600,
    lowerLimit: 77000,
    historicalPrices: {},
    intervals: ["15m", "4h"],
  },
  ETHUSDT: {
    upperLimit: 3500,
    lowerLimit: 3400,
    historicalPrices: {},
    intervals: ["15m", "4h"],
  }
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
    time: new Date(candle[0]).toISOString(),
    open: parseFloat(candle[1]),
    high: parseFloat(candle[2]),
    low: parseFloat(candle[3]),
    close: parseFloat(candle[4]),
    volume: parseFloat(candle[5]),
    buyVolume: candle[4] >= candle[1] ? parseFloat(candle[5]) : 0,
    sellVolume: candle[4] < candle[1] ? parseFloat(candle[5]) : 0,
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
      console.log(
        `Buscando histórico de preços (${interval}) para símbolos:`,
        symbols
      );

      const historicalData = await Promise.all(
        symbols.map((symbol) => fetchHistoricalPricesBinance(symbol, interval))
      );

      symbols.forEach(async (symbol, index) => {
        const config = monitoredCryptos[symbol];
        const data = historicalData[index];

        if (!config.historicalPrices[interval]) {
          config.historicalPrices[interval] = [];
          config.timestamps = [];
        }

        // Atualiza os preços e timestamps
        config.historicalPrices[interval] = data.map((candle) => candle.close);
        config.timestamps[interval] = data.map((candle) => candle.time);

        const currentPrice =
          config.historicalPrices[interval][
            config.historicalPrices[interval].length - 1
          ];

        const maxPrice = Math.max(...config.historicalPrices[interval]);
        const minPrice = Math.min(...config.historicalPrices[interval]);
        const avgPrice = (
          config.historicalPrices[interval].reduce((a, b) => a + b, 0) /
          config.historicalPrices[interval].length
        ).toFixed(2);

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
    console.error("Erro ao monitorar criptomoedas:", error);
  }
};

export default monitoredCryptos;
