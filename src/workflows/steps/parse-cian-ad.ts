import { z } from "zod";
import { Step } from "workflow-core";
import { DOMParser } from "dom-parser";
import { uploadFilesAndChat } from "#ai-agents/gemini.ts";
import readPdf from "#ai-agents/prompts/read-pdf.ts";
import { spyFetch } from "#utils/spyFetch.ts";
import { mergeImages } from "#utils/imageBase.ts";
import { log } from "#logger";

export const parseCianAdFromAgent = new Step<
  {
    exportUrl: string;
    images: string[];
    title: string;
    address: string;
    metadata: string;
  },
  {
    mergedImage: string;
    images: string[];
    description: string;
    title: string;
    address: string;
  }
>({
  id: "parseAd",
  inputSchema: z.object({
    exportUrl: z.string(),
    images: z.array(z.string()),
    title: z.string(),
    address: z.string(),
    metadata: z.string(),
  }),
  outputSchema: z.object({
    mergedImage: z.string(),
    images: z.array(z.string()),
    description: z.string(),
    title: z.string(),
    address: z.string(),
  }),
  async execute({ exportUrl, images, title, address, metadata }) {
    const mergedImage = await mergeImages(images, { jpeg: true, quality: 80 });
    const description =
      await uploadFilesAndChat(readPdf, `[METADATA]${metadata}[/METADATA]`, [
        exportUrl.toString(),
      ], 0) ?? "N/A";

    return {
      mergedImage,
      images,
      description,
      title: title.split("\n")[0],
      address,
    };
  },
});

export const parseCianAdFromUrl = new Step<
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
  if (!url.host.endsWith("cian.ru")) throw new Error("not cian ad");

  const exportUrl = new URL(
    `https://${url.host}${
      url.pathname.replace(/\/rent\/flat\//, "/export/pdf/rent/flat/")
    }`,
  );
  const html = await (await spyFetch(urlString)).text();

  if (
    html.includes(
      "Нам очень жаль, но запросы с вашего устройства похожи на автоматические.",
    )
  ) {
    throw new Error("not cian ad");
  }

  const doc = new DOMParser().parseFromString(html, "text/html");
  if (!doc) throw new Error("broken markup");

  const title =
    doc.querySelector('div[data-name="OfferTitleNew"]')?.textContent ?? "N/A";

  const address = (() => {
    const root = doc.querySelector('div[data-name="AddressContainer"]');
    if (!root) return "N/A";
    const span = root.querySelector('*[data-name="MapAnchor"]');
    if (span) root.removeChild(span);
    return root.textContent;
  })();

  const photos = (() => {
    const root = doc.querySelector('div[data-name="GalleryInnerComponent"]');
    if (!root) return [];
    const photos = root.querySelectorAll("img");
    return [
      ...new Set(
        Array.from(photos)
          .map((photo) => photo.getAttribute("src") ?? "")
          .filter(Boolean)
          .map((photo) => photo.replace(/-\d+(\.\w+)$/, "-1$1")),
      ),
    ];
  })();

  log.debug("photos:", photos);
  if (!photos.length) log.trace("html:", html);

  const mergedImage = await mergeImages(photos, { jpeg: true, quality: 80 });
  const description =
    await uploadFilesAndChat(readPdf, "", [exportUrl.toString()], 0) ?? "N/A";

  return { mergedImage, images: photos, description, title, address };
}

if (import.meta.main) {
  const dataUrl = await mergeImages([
    "https://images.cdn-cian.ru/images/2554865143-1.jpg",
    "https://images.cdn-cian.ru/images/2554865164-1.jpg",
    "https://images.cdn-cian.ru/images/2554865178-1.jpg",
    "https://images.cdn-cian.ru/images/2554865190-1.jpg",
    "https://images.cdn-cian.ru/images/2554865201-1.jpg",
    "https://images.cdn-cian.ru/images/2554865215-1.jpg",
    "https://images.cdn-cian.ru/images/2554865222-1.jpg",
    "https://images.cdn-cian.ru/images/2554865230-1.jpg",
  ], { jpeg: true, quality: 80 });
  await Deno.writeTextFile("merged.jpg.b64", dataUrl);
  console.info("saved to merged.jpg.b64");

  const step = await runStep({ url: "https://cian.ru/rent/flat/319554040/" });
  console.info("step:", step);
}
