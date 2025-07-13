import { z } from "zod";
import { Step } from "workflow-core";
import { DOMParser } from "dom-parser";
import {
  pasteFileAndFlashWebAsk,
  pasteFileAndLiteFlashWebAsk,
  uploadFilesAndChat,
} from "#ai-agents/gemini.ts";
import { spyFetch } from "#utils/spyFetch.ts";
import { mergeImages } from "#utils/imageBase.ts";
import { log } from "#logger";
import avitoParser from "#ai-agents/prompts/avito-parser.ts";
import { encodeBase64 } from "@std/encoding";

export const parseAvitoAdFromUrl = new Step<
  { url: string },
  {
    mergedImage: string;
    images: string[];
    description: string;
    title: string;
    address: string;
  }
>({
  id: "parseAd",
  inputSchema: z.object({ url: z.string() }),
  outputSchema: z.object({
    mergedImage: z.string(),
    images: z.array(z.string()),
    description: z.string(),
    title: z.string(),
    address: z.string(),
  }),
  execute: runStep,
});

export const parseAvitoAdFromHtml = new Step<
  { html: string },
  {
    mergedImage: string;
    images: string[];
    description: string;
    title: string;
    address: string;
  }
>({
  id: "parseAd",
  inputSchema: z.object({ html: z.string() }),
  outputSchema: z.object({
    mergedImage: z.string(),
    images: z.array(z.string()),
    description: z.string(),
    title: z.string(),
    address: z.string(),
  }),
  execute: runCore,
});

async function runStep(
  { url: urlString }: { url: string },
): Promise<
  {
    mergedImage: string;
    images: string[];
    description: string;
    title: string;
    address: string;
  }
> {
  const url = new URL(urlString);
  if (!url.host.endsWith("avito.ru")) throw new Error("not avito ad");

  const html = await (await spyFetch(urlString)).text();
  return await runCore({ html });
}

async function runCore(
  { html }: { html: string },
): Promise<
  {
    mergedImage: string;
    images: string[];
    description: string;
    title: string;
    address: string;
  }
> {
  if (html.includes('<h2 class="firewall-title">Доступ ограничен')) {
    throw new Error("Cannot parse avito ad from url");
  }

  const doc = new DOMParser().parseFromString(html, "text/html");
  if (!doc) throw new Error("broken markup");

  const title =
    doc.head.querySelector('meta[property="vk:title"]')?.getAttribute(
      "content",
    ) ?? "N/A";
  const address = doc.querySelector('div[itemProp="address"]')?.textContent ??
    "N/A";

  const photos = parsePhotos(html);

  log.debug("title:", title);
  log.debug("address:", address);
  log.debug("photos:", photos);
  if (!photos.length) log.debug("html:", html);

  const htmlBytes = new TextEncoder().encode(html);
  const htmlBase64 = encodeBase64(htmlBytes);

  const mergedImage = await mergeImages(photos, { jpeg: true, quality: 80 });
  const aiParse = await pasteFileAndFlashWebAsk(avitoParser, "", {
    mimeType: "text/html",
    base64: htmlBase64,
  }, 0)
    .catch(() =>
      pasteFileAndLiteFlashWebAsk(avitoParser, "", {
        mimeType: "text/html",
        base64: htmlBase64,
      }, 0)
    ) ??
    "N/A";

  log.debug("aiParse", aiParse);

  return { mergedImage, images: photos, description: aiParse, title, address };
}

const re = /window\.__initialData__\s*=\s*(["'`])([\s\S]*?)\1\s*;/;
function parsePhotos(html: string): string[] {
  // 1️⃣  Ищем window.__initialData__ = '...';  (или "..." / `...`)
  const match = html.match(re);
  if (!match) {
    console.log(html);
    throw Error("window.__initialData__ not found in HTML");
  }

  const encoded = match[2].trim();

  // 2️⃣  Декодируем из URI
  let jsonText: string;
  try {
    jsonText = decodeURIComponent(encoded);
  } catch (_) {
    // Если строка уже декодирована
    jsonText = encoded;
  }

  // 3️⃣  Парсим JSON
  let data: unknown;
  try {
    data = JSON.parse(jsonText);
  } catch (err) {
    throw Error(`Failed to parse JSON from window.__initialData__: ${err}`);
  }

  // 4️⃣  Рекурсивно собираем все URL‑ы картинок
  const images: string[] = [];
  walk("", data, images);

  return images;
}

/**
 * Рекурсивно обходит любое значение,
 * добавляя ссылки из galleryInfo.media в images[].
 */
function walk(
  key: string,
  value: unknown,
  images: string[],
): void {
  // 1. Пустышки сразу отбрасываем
  if (value === null || value === undefined) return;

  // 2. Наш целевой узел
  if (
    key === "galleryInfo" &&
    typeof value === "object" &&
    "media" in value
  ) {
    const media = (value as { media: Array<{ urls: Record<string, string> }> })
      .media;
    for (const { urls } of media) {
      const first = Object.values(urls)[0];
      if (first) images.push(first);
    }
    return; // дальше углубляться не нужно
  }

  // 3. Если это массив — проходим по индексам
  if (Array.isArray(value)) {
    value.forEach((item, idx) => walk(String(idx), item, images));
    return;
  }

  // 4. Если это объект — проходим по его полям
  if (typeof value === "object") {
    Object.entries(value as Record<string, unknown>).forEach(([k, v]) =>
      walk(k, v, images)
    );
  }
}

if (import.meta.main) {
  const urlString =
    "https://www.avito.ru/moskva/kvartiry/1-k._kvartira_35_m_816_et._4212251529";
  console.log(await runStep({ url: urlString }));
  const html = await (await spyFetch(urlString)).text();
  console.info(parsePhotos(html));
  const aiParse = await uploadFilesAndChat(avitoParser, "", [urlString], 0) ??
    "N/A";
  console.log(aiParse);
}
