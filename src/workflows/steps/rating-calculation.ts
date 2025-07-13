import { Step } from "workflow-core";
import { z } from "zod";
import {
  pasteFileAndFlashWebAsk,
  pasteFileAndProWebAsk,
} from "#ai-agents/gemini.ts";
import calculateRating from "#ai-agents/prompts/calculate-rating.ts";
import { log } from "#logger";
import { parseBase64Url } from "#utils/imageBase.ts";

export interface Input {
  stops: string;
  routes: string[];
  operators: string[];
  mergedImage: string;
  description: string;
  title: string;
  address: string;
}

export default new Step<
  Input,
  { message: string }
>({
  id: "ratingCalculation",
  inputSchema: z.object({
    stops: z.string(),
    routes: z.array(z.string()),
    operators: z.array(z.string()),
    mergedImage: z.string(),
    description: z.string(),
    title: z.string(),
    address: z.string(),
  }),
  outputSchema: z.object({ message: z.string() }),
  async execute(
    { stops, routes, operators, mergedImage, description, title, address },
  ) {
    log.debug("run step");

    const prompt = `# ${title}\n${address}\n\n` +
      `[ОПИСАНИЕ]${description}[/ОПИСАНИЕ]\n\n` +
      `[ОСТАНОВКИ]${stops}[/ОСТАНОВКИ]\n\n` +
      `[МАРШРУТЫ]${routes.join("\n---\n")}[/МАРШРУТЫ]\n\n` +
      `[ОПЕРАТОРЫ]${operators.join("\n")}[/ОПЕРАТОРЫ]`;

    const { mimeType, data: base64 } = await parseBase64Url(mergedImage);
    const result = await pasteFileAndProWebAsk(
      calculateRating,
      prompt,
      { mimeType, base64 },
      0.3,
    ).catch(log.warn) ??
      await pasteFileAndFlashWebAsk(calculateRating, prompt, {
        mimeType,
        base64,
      }, 0.3).catch(log.warn);

    if (typeof result !== "string") {
      throw new Error("result is not string");
    }

    return { message: result };
  },
});

if (import.meta.main) {
  const { mergeImages } = await import("#utils/imageBase.ts");
  const base64 = await mergeImages([
    "https://images.cdn-cian.ru/images/2554865143-1.jpg",
  ]);
  const { mimeType, data } = await parseBase64Url(base64);
  console.info(
    await pasteFileAndProWebAsk(
      calculateRating,
      "Дай оценку квартиры по фоткам",
      { mimeType, base64: data },
      0.3,
    ),
  );
}
