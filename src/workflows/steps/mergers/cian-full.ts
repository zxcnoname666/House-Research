import { Step } from "workflow-core";
import { z } from "zod";
import { Input } from "../rating-calculation.ts";
import { extractBag } from "../methods/extractBag.ts";

export default () =>
  new Step<
    unknown,
    Input
  >({
    id: crypto.randomUUID(),
    outputSchema: z.object({
      stops: z.string(),
      routes: z.array(z.string()),
      operators: z.array(z.string()),
      mergedImage: z.string(),
      description: z.string(),
      title: z.string(),
      address: z.string(),
    }),
    execute(_, bag) {
      return extractBag(bag);
    },
  });
