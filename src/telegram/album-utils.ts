import { Bot, InputMediaBuilder } from "./deps.ts";
import {log} from "#logger";

/** режем массив на чанки ровно по N элементов */
function chunk<T>(arr: T[], size = 10): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
}

/**
 * Отправляет любое число URL-ов картинок альбомами по ≤ 10 штук.
 * caption добавляем только к первой картинке первого альбома (Telegram разрешает
 * единственную подпись на весь альбом).
 */
export async function safeSendAlbumsToTopic(
    bot: Bot,
    chatId: number | string,
    threadId: number,
    urls: string[],
    caption = "",
) {
    const groups = chunk(urls, 10); // ➊ делим на альбомы
    for (const [albumIndex, group] of groups.entries()) { // ➋ отправляем по очереди
        const media = group.map((url, i) =>
            InputMediaBuilder.photo(
                url,
                albumIndex === 0 && i === 0 ? { caption } : {}, // подпись только одна
            )
        );
        await bot.api.sendMediaGroup(chatId, media, {
            message_thread_id: threadId, // вложение в тему
        }).catch(log.error);
    }
}
