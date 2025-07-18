import { Step } from "workflow-core";
import { z } from "zod";
import {inputZod} from "../rating-calculation.ts";
import { extractBag } from "../methods/extractBag.ts";

export default () =>
  new Step<
    unknown,
      z.infer<typeof inputZod>
  >({
    id: crypto.randomUUID(),
    outputSchema: inputZod,
    execute(_, bag) {
      return extractBag(bag);
    },
  });
