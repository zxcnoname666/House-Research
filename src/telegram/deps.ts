import {
    DOMParser,
    Element,
} from "dom-parser";

export {
    Bot,
    InputFile,
    InputMediaBuilder,
} from "grammy";

export { autoRetry } from "grammy-auto-retry";


/** Множество тегов, разрешённых Bot API 9.0 */
const allowedTags = new Set([
    "b", "strong", "i", "em", "u", "ins",
    "s", "strike", "del",
    "span",         // нужен только с class="tg-spoiler"
    "tg-spoiler",   // эквивалент <span class="tg-spoiler">
    "code", "pre",
    "a",
    "tg-emoji",
    "blockquote",
]);

/** Разрешённые атрибуты по тегам */
function isAllowedAttr(el: Element, name: string): boolean {
    const tag = el.tagName.toLowerCase();
    if (tag === "a" && name === "href") return true;                  // ссылки/mention
    if (tag === "tg-emoji" && name === "emoji-id") return true;       // кастом-эмодзи
    if (tag === "blockquote" && name === "expandable") return true;   // сворачиваемая цитата
    if (tag === "span" && name === "class" && el.getAttribute(name) === "tg-spoiler") {
        return true;                                                    // класс-спойлер
    }
    return false;
}

/**
 * Очищает HTML от любых тегов и атрибутов,
 * не поддерживаемых parse_mode='HTML' в Telegram-Bot API.
 */
export function sanitizeTelegramHtml(html: string): string {
    // 1. Парсим документ
    const doc = new DOMParser().parseFromString(html, "text/html");
    if (!doc) return "";

    // 2. Проходим по всем элементам
    doc.body?.querySelectorAll("*").forEach((el) => {
        const tag = el.tagName.toLowerCase();

        // 2.1 Неизвестный тег → разворачиваем (оставляем только текст)
        if (!allowedTags.has(tag)) {
            const parent = el.parentElement;
            if (parent) parent.replaceChild(doc.createTextNode(el.textContent ?? ""), el);
            return;
        }

        // 2.2 Фильтруем атрибуты даже у разрешённого тега
        for (const attr of [...el.attributes]) {
            if (!isAllowedAttr(el as Element, attr.name)) {
                el.removeAttribute(attr.name);
            }
        }

        // 2.3 Спойлер-span → Telegram ждёт exact class="tg-spoiler"
        if (tag === "span" && el.getAttribute("class") !== "tg-spoiler") {
            el.removeAttribute("class");
        }
    });

    // 3. Возвращаем «чистый» HTML-фрагмент
    return doc.body?.innerHTML ?? "";
}

/**
 * Делит длинную строку на блоки ≤ limit (4096 по умолчанию),
 * стараясь резать по переносам строк, чтобы не обрывать слова.
 */
export function chunkText(
    text: string,
    limit = 4096,
): string[] {
    if (limit <= 0) throw new RangeError("limit must be > 0");

    const out: string[] = [];
    let buf = "";

    for (const line of text.split("\n")) {
        if (buf.length + line.length + 1 > limit) {
            // кладём собранный абзац
            out.push(buf);
            buf = line;                 // начинаем новый
        } else {
            buf = buf ? `${buf}\n${line}` : line;
        }
    }
    if (buf) out.push(buf);
    return out;
}