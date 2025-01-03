import whatsappWeb from "whatsapp-web.js";
import qrcode from "qrcode-terminal";

const { Client, LocalAuth } = whatsappWeb;

const client = new Client({
  authStrategy: new LocalAuth(),
});

client.on("qr", (qr) => {
  qrcode.generate(qr, { small: true });
  console.log("QR code received. Scan with WhatsApp.");
});

client.on("ready", () => {
  console.log("WhatsApp client is ready!");
});

client.initialize();

export const sendMessage = async (number, message) => {
  const formattedNumber = `${number}@c.us`; // Format for international numbers
  await client.sendMessage(formattedNumber, message);
};
