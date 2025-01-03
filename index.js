import express from "express";
import dotenv from "dotenv";
import btcRoutes from "./routes/btc.js";
import notificationRoutes from "./routes/notifications.js";
import assetsRoutes from "./routes/assets.js";
import cron from "node-cron";
import { monitorCryptos } from "./services/CryptoMonitor.js";
import { monitorForexCommodities } from "./services/ForexCommoditiesMonitor.js";

dotenv.config();
const app = express();

// Middleware
app.use(express.json());

// Routes
app.use("/btc", btcRoutes);

// Root Route
app.get("/", (req, res) => {
  res.send("Day Trading Agent is running!");
});

app.use("/assets", assetsRoutes);

app.use("/notifications", notificationRoutes);

// Server Listener
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Agendamento dos monitores
cron.schedule('*/1 * * * *', async () => {
  console.log('Monitorando criptomoedas...');
  await monitorCryptos();
});

cron.schedule('*/1 * * * *', async () => {
  console.log('Monitorando Forex e commodities...');
  await monitorForexCommodities();
});