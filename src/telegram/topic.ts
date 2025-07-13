import { Bot, chunkText, sanitizeTelegramHtml } from "./deps.ts";
import { safeSendAlbumsToTopic } from "./album-utils.ts";
import { log } from "#logger";
import { createMutex } from "mutex";

const kv = await Deno.openKv("./kv/telegram.sqlite3"); // хранит соответствие topicKey ↔ threadId
const topicLocks = new Map<string, ReturnType<typeof createMutex>>(); // глобальное хранилище локов

export interface SendToTopicOptions {
  topicKey: string; // «неизменяемый» ключ
  title: string; // название темы при создании
  message: string; // текст-подпись под фото
  quotes: string[]; // массив цитат
  imageUrls: string[]; // изображение base64
  lat: number; // широта
  lon: number; // долгота
  address?: string; // улица/дом, чтобы была mini-карта
  placeTitle?: string; // подпись пина (по умолч. = title)
  iconColor?:
    | 16478047
    | 7322096
    | 16766590
    | 13338331
    | 9367192
    | 16749490
    | undefined; // один из шести RGB 0x6FB9F0 … 0xFB6F5F
}

export async function sendToTopic(
  bot: Bot,
  chatId: number | string,
  opts: SendToTopicOptions,
) {
  const {
    topicKey,
    title,
    message,
    quotes,
    imageUrls,
    lat,
    lon,
    address,
    placeTitle,
    iconColor,
  } = opts;

  // 0) получаем (или создаём) мьютекс для данного ключа
  let mx = topicLocks.get(topicKey);
  if (!mx) {
    mx = createMutex();
    topicLocks.set(topicKey, mx);
  }

  await mx.acquire();
  try {
    // 1) ищем сохранённый message_thread_id
    const key = ["topics", String(chatId), topicKey] as const;
    let threadId = (await kv.get<number>(key)).value;

    // 2) если темы ещё нет — создаём её
    if (!threadId) {
      const created = await bot.api.createForumTopic(
        chatId, // 1-й арг. – chat_id
        title, // 2-й арг. – название темы
        { // 3-й арг. – доп. поля
          icon_color: iconColor ?? 16478047,
        },
      );
      threadId = created.message_thread_id;
      log.debug("created topic", threadId);
      await kv.set(key, threadId);
    }

    // 3) отправляем единое сообщение-фото в найденную/созданную тему
    await safeSendAlbumsToTopic(bot, chatId, threadId, imageUrls, title).catch(
      log.error,
    );

    // 4) «мини-карта»: Venue → (lat,lon, title, address)
    let addressSent = false;
    if (address) {
      await bot.api.sendVenue(
        chatId,
        lat,
        lon,
        placeTitle ?? title,
        address,
        { message_thread_id: threadId }, // Venue видит параметр треда
      )
        .then(() => addressSent = true)
        .catch(log.warn);
    }
    if (!addressSent) {
      // или просто точку на карте
      await bot.api.sendLocation(
        chatId,
        lat,
        lon,
        { message_thread_id: threadId }, // Location тоже поддерживает треды
      ).catch(log.warn);
    }

    // 5) длинный текст → чанки ≤ 4096
    for (
      const chunk of [
        ...chunkText(message),
        ...quotes.map((text) => chunkText(text, 4000)).flat().map((quote) =>
          `<blockquote expandable>${quote}</blockquote>`
        ),
      ]
    ) {
      await bot.api.sendMessage(chatId, sanitizeTelegramHtml(chunk), {
        message_thread_id: threadId,
        parse_mode: "HTML",
      }).catch(log.warn);
    }
  } finally {
    mx.release();
  }
}
