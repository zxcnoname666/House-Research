import { Bot } from "./deps.ts";

/** Шлёт текст в «общий» поток (General topic = threadId 0). */
export async function sendToMainChannel(
  bot: Bot,
  chatId: number | string,
  text: string,
) {
  await bot.api.sendMessage(chatId, text); // без message_thread_id
}
