import {Parallel, chain, createWorkflow} from "workflow-core";
import findOperatorsByAddress from "./steps/find-operators-by-address.ts";
import getNavigationFromAddress from "./steps/get-navigation-from-address.ts";
import {z} from "zod";
import ratingCalculation from "./steps/rating-calculation.ts";
import cianFull from "./steps/mergers/cian-full.ts";
import computeFinalSchema from "./steps/compute-final-schema.ts";
import {parseAvitoAdFromHtml, parseAvitoAdFromUrl} from "./steps/parse-avito-ad.ts";

export const avitoParseFromUrl = createWorkflow({
    name: "avitoParserFlow",
    steps: chain(parseAvitoAdFromUrl, Parallel(findOperatorsByAddress, getNavigationFromAddress), cianFull(), ratingCalculation, computeFinalSchema),
    triggerSchema: z.object({ url: z.string() }),
});

export const avitoParseFromHtml = createWorkflow({
    name: "avitoParserFlow",
    steps: chain(parseAvitoAdFromHtml, Parallel(findOperatorsByAddress, getNavigationFromAddress), cianFull(), ratingCalculation, computeFinalSchema),
    triggerSchema: z.object({ html: z.string() }),
});