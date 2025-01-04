import Chart from "chart.js/auto";
import fs from "fs";
import { createCanvas } from "canvas";

export const generateCryptoChart = async (symbol, interval,data, indicators) => {
  const { prices, macd, bollinger, rsi } = indicators;

  // Cria um canvas para o gráfico
  const canvas = createCanvas(800, 600);
  const ctx = canvas.getContext("2d");

  new Chart(ctx, {
    type: "line",
    data: {
      labels: data.timestamps.map(
        (timestamp) => new Date(timestamp).toLocaleDateString("en-GB") // Formata as datas como DD/MM/YY
      ),
      datasets: [
        {
          label: `${symbol} Prices`,
          data: prices,
          borderColor: "blue",
          borderWidth: 2,
          fill: false,
          yAxisID: "y-prices",
        },
        {
          label: "Bollinger Upper Band",
          data: bollinger.upper || [], // Banda superior
          borderColor: "green",
          borderDash: [5, 5],
          fill: false,
          yAxisID: "y-prices",
        },
        {
          label: "Bollinger Lower Band",
          data: bollinger.lower || [], // Banda inferior
          borderColor: "red",
          borderDash: [5, 5],
          fill: false,
          yAxisID: "y-prices",
        },
        {
          label: "MACD Signal",
          data: macd.signal || [],
          borderColor: "purple",
          borderWidth: 1,
          fill: false,
          yAxisID: "y-indicators",
        },
        {
          label: "RSI",
          data: rsi || [],
          borderColor: "orange",
          borderWidth: 1,
          fill: false,
          yAxisID: "y-indicators",
        },
      ],
    },
    options: {
      responsive: false,
      scales: {
        x: {
          title: {
            display: true,
            text: "Time",
          },
        },
        y: {
          "y-prices": {
            type: "linear",
            position: "left",
            title: {
              display: true,
              text: "Price",
            },
          },
          "y-indicators": {
            type: "linear",
            position: "right",
            title: {
              display: true,
              text: "Indicators",
            },
            grid: {
              drawOnChartArea: false, // Remove a sobreposição de grades
            },
          },
        },
      },
      plugins: {
        title: {
          display: true,
          text: `Chart for ${symbol} (${interval})`,
        },
      },
    },
  });

  // Salva o gráfico como imagem
  const buffer = canvas.toBuffer("image/png");
  fs.writeFileSync(`./content/${symbol}_${interval}.png`, buffer);
  console.log(`Gráfico gerado para ${symbol}: ./charts/${symbol}_chart.png`);
};
