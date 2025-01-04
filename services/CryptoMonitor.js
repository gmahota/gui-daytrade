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

        config.historicalPrices[interval] = data.map((candle) => candle.close);
        config.timestamps[interval] = data.map((candle) => candle.time);

        const currentPrice = parseFloat(
          config.historicalPrices[interval][
            config.historicalPrices[interval].length - 1
          ]
        );

        const maxPrice = Math.max(...config.historicalPrices[interval]);
        const minPrice = Math.min(...config.historicalPrices[interval]);
        const avgPrice = parseFloat(
          (
            config.historicalPrices[interval].reduce((a, b) => a + b, 0) /
            config.historicalPrices[interval].length
          ).toFixed(2)
        );

        const totalBuyVolume = data.reduce(
          (acc, candle) => acc + parseFloat(candle.buyVolume),
          0
        );
        const totalSellVolume = data.reduce(
          (acc, candle) => acc + parseFloat(candle.sellVolume),
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
        const atrValue = parseFloat(atr[atr.length - 1]);
        const rsiValue = parseFloat(rsi[rsi.length - 1]);

        let hasAlert = false; // Adicionado para rastrear alertas

        let explanation = `Relatório para ${symbol} (${interval}):\n`;

        if (macdValue && macdValue.histogram > 0) {
          hasAlert = true;
          const entryPrice =
            parseFloat(currentPrice) + parseFloat(atrValue) * 0.5;
          const targetPrice = entryPrice + parseFloat(atrValue) * 2;
          const stopLoss =
            parseFloat(currentPrice) - parseFloat(atrValue) * 1.5;
          explanation += `- MACD positivo: Tendência de alta detectada. Sugestão de Compra: Entrar acima de $${entryPrice.toFixed(
            2
          )}, Alvo: $${targetPrice.toFixed(2)}, Stop Loss: $${stopLoss.toFixed(
            2
          )}.\n`;
        }

        if (macdValue && macdValue.histogram < 0) {
          hasAlert = true;
          const entryPrice =
            parseFloat(currentPrice) - parseFloat(atrValue) * 0.5;
          const targetPrice = entryPrice - parseFloat(atrValue) * 2;
          const stopLoss =
            parseFloat(currentPrice) + parseFloat(atrValue) * 1.5;
          explanation += `- MACD negativo: Tendência de baixa detectada. Sugestão de Venda: Entrar abaixo de $${entryPrice.toFixed(
            2
          )}, Alvo: $${targetPrice.toFixed(2)}, Stop Loss: $${stopLoss.toFixed(
            2
          )}.\n`;
        }

        if (bollingerValue) {
          if (currentPrice > parseFloat(bollingerValue.upper)) {
            hasAlert = true;
            const entryPrice =
              parseFloat(currentPrice) + parseFloat(atrValue) * 0.2;
            const targetPrice =
              entryPrice +
              (parseFloat(bollingerValue.upper) -
                parseFloat(bollingerValue.lower));
            const stopLoss =
              entryPrice -
              (parseFloat(bollingerValue.upper) -
                parseFloat(bollingerValue.lower)) /
                2;
            explanation += `- Preço acima da banda superior (Bollinger): Possível sobrecompra. Sugestão de Consolidação: Entrar acima de $${entryPrice.toFixed(
              2
            )}, Alvo: $${targetPrice.toFixed(
              2
            )}, Stop Loss: $${stopLoss.toFixed(2)}.\n`;
          } else if (currentPrice < parseFloat(bollingerValue.lower)) {
            hasAlert = true;
            const entryPrice =
              parseFloat(currentPrice) - parseFloat(atrValue) * 0.2;
            const targetPrice =
              entryPrice -
              (parseFloat(bollingerValue.upper) -
                parseFloat(bollingerValue.lower));
            const stopLoss =
              entryPrice +
              (parseFloat(bollingerValue.upper) -
                parseFloat(bollingerValue.lower)) /
                2;
            explanation += `- Preço abaixo da banda inferior (Bollinger): Possível sobrevenda. Sugestão de Consolidação: Entrar abaixo de $${entryPrice.toFixed(
              2
            )}, Alvo: $${targetPrice.toFixed(
              2
            )}, Stop Loss: $${stopLoss.toFixed(2)}.\n`;
          }
        }

        if (rsiValue > 70) {
          hasAlert = true;
          const entryPrice =
            parseFloat(currentPrice) - parseFloat(atrValue) * 0.5;
          const targetPrice = entryPrice - parseFloat(atrValue) * 2;
          const stopLoss =
            parseFloat(currentPrice) + parseFloat(atrValue) * 1.5;
          explanation += `- RSI elevado (${rsiValue.toFixed(
            2
          )}): Mercado em sobrecompra. Sugestão de Venda: Entrar abaixo de $${entryPrice.toFixed(
            2
          )}, Alvo: $${targetPrice.toFixed(2)}, Stop Loss: $${stopLoss.toFixed(
            2
          )}.\n`;
        }

        if (rsiValue < 30) {
          hasAlert = true;
          const entryPrice =
            parseFloat(currentPrice) + parseFloat(atrValue) * 0.5;
          const targetPrice = entryPrice + parseFloat(atrValue) * 2;
          const stopLoss =
            parseFloat(currentPrice) - parseFloat(atrValue) * 1.5;
          explanation += `- RSI baixo (${rsiValue.toFixed(
            2
          )}): Mercado em sobrevenda. Sugestão de Compra: Entrar acima de $${entryPrice.toFixed(
            2
          )}, Alvo: $${targetPrice.toFixed(2)}, Stop Loss: $${stopLoss.toFixed(
            2
          )}.\n`;
        }

        if (atrValue && atrValue > config.upperLimit - config.lowerLimit) {
          hasAlert = true;
          explanation += `- ATR elevado: Alta volatilidade detectada.\n`;
        }

        // Condição para envio de mensagens e gráficos
        if (hasAlert) {
          const caption =
            `📊 Gráfico para ${symbol} (${interval}):\n` +
            `- Preço Atual: $${currentPrice}\n` +
            `- Máximo: $${maxPrice}\n` +
            `- Mínimo: $${minPrice}\n` +
            `- Médio: $${avgPrice}\n` +
            `- Volume Total de Compras: ${totalBuyVolume.toFixed(2)}\n` +
            `- Volume Total de Vendas: ${totalSellVolume.toFixed(2)}\n` +
            `- MACD: ${macdValue?.histogram?.toFixed(2)}\n` +
            `- Bollinger Bands: Superior - $${parseFloat(
              bollingerValue?.upper
            ).toFixed(2)}, Inferior - $${parseFloat(
              bollingerValue?.lower
            ).toFixed(2)}\n` +
            `- RSI: ${rsiValue?.toFixed(2)}\n` +
            `- ATR: ${atrValue?.toFixed(2)}\n`;

          // Defina o caminho para o gráfico gerado
          const imagePath = `./content/${symbol}_${interval}.png`;
          await sendImage(process.env.PhoneAlert, imagePath, caption);
          await sendMessage(process.env.PhoneAlert, explanation);
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
