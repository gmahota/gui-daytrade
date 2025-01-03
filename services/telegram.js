import TelegramBot from "node-telegram-bot-api";
import dotenv from "dotenv";
dotenv.config();

// Substitua pelo token do bot gerado no BotFather
const token = process.env.TELEGRAM_TOKEN;
const bot = new TelegramBot(token, { polling: true });

// Enviar mensagem para um chat específico
// Enviar mensagem para um chat específico
export const sendTelegramMessage = async (chatId, message) => {
  try {
    await bot.sendMessage(chatId, message);
    console.log(`Mensagem enviada para o chatId ${chatId}: ${message}`);
  } catch (error) {
    console.error('Erro ao enviar mensagem:', error);
  }
};

// Opcional: Registrar comandos ou ouvir mensagens
bot.on("message", (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(
    chatId,
    `Olá! Estou ativo e pronto para enviar notificações. ${chatId}`
  );
});
