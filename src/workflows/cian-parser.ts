import {Parallel, chain, createWorkflow} from "workflow-core";
import {parseCianAdFromAgent, parseCianAdFromUrl} from "./steps/parse-cian-ad.ts";
import findOperatorsByAddress from "./steps/find-operators-by-address.ts";
import getNavigationFromAddress from "./steps/get-navigation-from-address.ts";
import {z} from "zod";
import ratingCalculation from "./steps/rating-calculation.ts";
import cianFull from "./steps/mergers/cian-full.ts";
import computeFinalSchema from "./steps/compute-final-schema.ts";

export const cianParseFromUrl = createWorkflow({
    name: "cianParserFlow",
    steps: chain(parseCianAdFromUrl, Parallel(findOperatorsByAddress, getNavigationFromAddress), cianFull(), ratingCalculation, computeFinalSchema),
    triggerSchema: z.object({ url: z.string() }),
});

export const cianParseFromAgent = createWorkflow({
    name: "cianParserFlow",
    steps: chain(parseCianAdFromAgent, Parallel(findOperatorsByAddress, getNavigationFromAddress), cianFull(), ratingCalculation, computeFinalSchema),
    triggerSchema: z.object({ exportUrl: z.string(), images: z.array(z.string()), title: z.string(), address: z.string(), metadata: z.string() }),
});


if (import.meta.main) {
    const output = await cianParseFromUrl.run({ url: "https://cian.ru/rent/flat/319554040/" });
    console.info("output:", output);
}