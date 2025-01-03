import axios from "axios";

export const getBTCPrice = async () => {
  const endpoint = "https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT";
  const response = await axios.get(endpoint);
  return response.data.price;
};
