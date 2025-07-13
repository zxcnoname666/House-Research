import { extname } from "@std/path";
import { Buffer } from "node:buffer";
import { Image } from "imagescript";
import { spyFetch } from "./spyFetch.ts";
import { log } from "#logger";

type InlineData = { mimeType: string; data: string };

/**
 * Преобразует строку data-URL **или** путь/сырой Base64 → { mimeType, data }
 *
 * @param input  data:image/... строка ИЛИ путь к файлу ИЛИ чистый base64
 * @param fallbackExt  расширение «по-умолчанию» (если не удаётся определить)
 */
export async function parseBase64Url(
  input: string,
  fallbackExt = ".png",
): Promise<InlineData> {
  // 1) если это data-URL
  if (input.startsWith("data:")) {
    const [, meta, b64] = input.match(/^data:(.+?);base64,(.+)$/)!;
    return { mimeType: meta, data: b64 };
  }

  // 2) если строка похожа на путь к существующему файлу
  try {
    const stat = await Deno.stat(input);
    if (stat.isFile) {
      const bytes = await Deno.readFile(input);
      const b64 = btoa(String.fromCharCode(...bytes));
      const ext = extname(input) || fallbackExt;
      const mime = ext2mime(ext);
      return { mimeType: mime, data: b64 };
    }
  } catch (_) {
    /* ignore — не файл, идём дальше */
  }

  // 3) считаем, что это «сырой» Base64 без префикса
  return { mimeType: ext2mime(fallbackExt), data: input };
}

/** Простое сопоставление расширения → MIME */
function ext2mime(ext: string): string {
  return {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
  }[ext.toLowerCase()] ?? "application/octet-stream";
}

export async function mergeImages(
  urls: string[],
  {
    direction = "vertical", // "vertical" | "horizontal"
    jpeg = false, // true → JPEG; false → PNG
    quality = 95, // JPEG quality (1-100)
  } = {},
): Promise<string> {
  if (!urls.length) throw new Error("Empty URL list");

  // 1) Download & decode
  const images: Image[] = [];
  for (const url of urls) {
    const res = await spyFetch(url);
    if (!(res.ok && res.headers.get("content-type")?.startsWith("image/"))) {
      log.warn(`${url}: ${res.status}: ${res.headers.get("content-type")}`);
      continue;
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    images.push(await Image.decode(bytes));
  }

  if (!images.length) {
    throw new Error("No images");
  }

  // 2) Compute canvas size
  const w = direction === "vertical"
    ? Math.max(...images.map((i) => i.width))
    : images.reduce((s, i) => s + i.width, 0);

  const h = direction === "vertical"
    ? images.reduce((s, i) => s + i.height, 0)
    : Math.max(...images.map((i) => i.height));

  // 3) Compose
  const canvas = new Image(w, h);
  let ox = 0, oy = 0;
  for (const img of images) {
    canvas.composite(img, ox, oy); // без масштабирования
    if (direction === "vertical") {
      oy += img.height;
    } else {
      ox += img.width;
    }
  }

  // 4) Encode
  const encodedBytes = await (jpeg
    ? canvas.encodeJPEG(quality) // lossy, maximal quality
    : canvas.encode()); // PNG lossless

  const b64 = Buffer.from(encodedBytes).toString("base64");
  return `data:image/${jpeg ? "jpeg" : "png"};base64,${b64}`;
}

/** Convert data-URL PNG → data-URL JPEG */
export async function pngDataUrlToJpegDataUrl(
  pngUrl: string,
  quality = 90,
): Promise<string> {
  // 1 Strip the “data:” header and keep the payload (Base-64 bytes)
  const [, b64] = pngUrl.split(",", 2);
  if (!b64) throw new Error("Malformed data-URL");

  // 2 Decode Base-64 → Uint8Array
  const pngBytes = Buffer.from(b64, "base64");

  // 3 Convert png -> jpeg
  const image = await Image.decode(pngBytes);
  const jpegBytes = await image.encodeJPEG(quality);

  // 4 Re-encode as Base-64 and wrap in a data-URL
  return `data:image/jpeg;base64,${Buffer.from(jpegBytes).toString("base64")}`;
}

/* ------------------------------------------------------------------ */
/*                     пример использования                           */
/* ------------------------------------------------------------------ */
if (import.meta.main) {
  // Пример минималистичного 1x1 пикселя PNG (красный цвет) в формате Base64
  const samplePng =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

  console.info("--- Deno PNG to JPEG Converter ---");
  console.info("\nOriginal PNG Data URL:");
  console.info(samplePng);

  try {
    // Вызываем нашу асинхронную функцию
    const jpegResult = await pngDataUrlToJpegDataUrl(samplePng, 0.85);

    console.info("\nConverted JPEG Data URL (Quality: 0.85):");
    console.info(jpegResult);
    console.info("\nConversion successful!");
  } catch (e) {
    console.error("\nConversion failed:", e);
  }

  // data-URL
  const url = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA…";
  console.info(await parseBase64Url(url));

  // путь к файлу
  console.info(await parseBase64Url("./small-sample.jpg"));

  // сырой base64
  console.info(await parseBase64Url("iVBORw0KGgoAAAANS..."));
}
