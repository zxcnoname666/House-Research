import { Step } from "workflow-core";
import { z } from "zod";
import { safeFreeAi, safeFreeThink } from "./methods/ai.ts";
import parseFinalType from "#ai-agents/prompts/parse-final-type.ts";
import { extractBag, removeCodeBlock } from "./methods/extractBag.ts";
import { getCoordsByParsedAddress, parseAddress } from "./methods/coords.ts";
import finalRewrite from "#ai-agents/prompts/final-rewrite.ts";
import titleMaker from "#ai-agents/prompts/title-maker.ts";
import { log } from "#logger";

export interface Output {
  message: string;
  title: string;
  address: string;
  routes: string;
  operators: string;
  images: string[];
  ratingKey: string;
  geo: { lat: number; lon: number };
}

export default new Step<
  unknown,
  Output
>({
  id: "computeFinalSchema",
  outputSchema: z.object({
    message: z.string(),
    title: z.string(),
    address: z.string(),
    routes: z.string(),
    operators: z.string(),
    images: z.array(z.string()),
    ratingKey: z.string(),
    geo: z.object({ lat: z.number(), lon: z.number() }),
  }),
  async execute(_, bag) {
    log.debug("run step");
    const { title, address, routes, operators, images } = extractBag(bag);

    const result = bag["ratingCalculation.message"];

    if (typeof result !== "string") {
      throw new Error("result is not string");
    }

    const parsedAddress = await parseAddress(address);
    log.debug("parsedAddress:", parsedAddress);
    const coords = await getCoordsByParsedAddress(parsedAddress);
    log.debug("coords:", parsedAddress, coords, {
      lat: coords[0]?.lat ?? 0,
      lon: coords[0]?.lon ?? 0,
    });

    const rating = await safeFreeAi(parseFinalType, result);
    log.debug("rating...");
    const finalMessage = await safeFreeThink(
      finalRewrite,
      `${result}\n\n## Операторы\n${operators}\n\n## Маршруты\n${routes}`,
    );
    log.debug("finalMessage", finalMessage);
    const finalTitle = await safeFreeThink(
      titleMaker,
      `${title}\n\n${address}\n\n${result}\n\n## Операторы\n${operators}\n\n## Маршруты\n${routes}`,
    );
    log.debug("finalTitle", finalTitle);

    return {
      message: removeCodeBlock(finalMessage),
      title: finalTitle.split("\n")[0],
      address,
      images,
      routes: routes.join("\n---\n"),
      operators: operators.join("\n"),
      ratingKey: rating,
      geo: {
        lat: coords[0]?.lat ?? 0,
        lon: coords[0]?.lon ?? 0,
      },
    };
  },
});
