import whatsappWeb from "whatsapp-web.js";
import qrcode from "qrcode-terminal";

const { Client, LocalAuth, MessageMedia } = whatsappWeb;

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

export const sendImage = async (number, imagePath, caption) => {
  try {
    const formattedNumber = `${number}@c.us`; // Formata para números internacionais
    const media = MessageMedia.fromFilePath(imagePath);

    await client.sendMessage(formattedNumber, media, { caption });
    console.log(`Imagem enviada para ${number} com sucesso.`);
  } catch (error) {
    console.error(`Erro ao enviar imagem para ${number}:`, error);
  }
};