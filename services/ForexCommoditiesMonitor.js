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
  gold: {
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

export const setForexLimits = (symbol, upperLimit, lowerLimit) => {
  monitoredForexCommodities[symbol] = {
    ...monitoredForexCommodities[symbol],
    upperLimit,
    lowerLimit,
  };
  console.log(
    `Configurações atualizadas para ${symbol}:`,
    monitoredForexCommodities[symbol]
  );
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

        config.historicalPrices[interval] = data.map((candle) => candle.close);
        config.timestamps[interval] = data.map((candle) => candle.time);

        const currentPrice = config.historicalPrices[interval].slice(-1)[0];
        const maxPrice = Math.max(...config.historicalPrices[interval]);
        const minPrice = Math.min(...config.historicalPrices[interval]);
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

        const rsi = RSI.calculate({
          values: config.historicalPrices[interval],
          period: 14,
        });

        const atr = ATR.calculate({
          high: config.historicalPrices[interval],
          low: config.historicalPrices[interval],
          close: config.historicalPrices[interval],
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
        
        export default monitoredForexCommodities;
        