import OpenAI from "openai";
import { chatWithOpenAI, createOpenAi } from "./core_fetch.ts";
import { OPENROUTER_API_KEY } from "#env";
import { log } from "#logger";

const openAiInstances = new Set<OpenAI>();
for (const key of OPENROUTER_API_KEY) {
  const openai = createOpenAi({
    apiKey: key,
    endpoint: "https://openrouter.ai/api/v1",
  });
  openAiInstances.add(openai);
}

const thinkFreeModels = [
  "deepseek/deepseek-r1:free",
  "deepseek/deepseek-r1-0528:free",
  "tngtech/deepseek-r1t2-chimera:free",
  "microsoft/mai-ds-r1:free",
];

log.info(
  "OpenRouter API instances:",
  openAiInstances.size,
  "models:",
  thinkFreeModels.length,
);

export async function chat(
  systemPrompt: string,
  userPrompt: string,
  temperature: number = 0.7,
) {
  for (const model of thinkFreeModels) {
    try {
      return await chatWithModel(systemPrompt, userPrompt, temperature, model);
    } catch (err) {
      log.trace(err);
    }
  }

  throw new Error("No models");
}

export async function chatWithModel(
  systemPrompt: string,
  userPrompt: string,
  temperature: number,
  model: string,
) {
  for (const openai of openAiInstances) {
    try {
      return await chatWithModelAndInstance(
        systemPrompt,
        userPrompt,
        temperature,
        model,
        openai,
      );
    } catch (err) {
      log.trace(err);
    }
  }

  throw new Error("No instances");
}

async function chatWithModelAndInstance(
  systemPrompt: string,
  userPrompt: string,
  temperature: number,
  model: string,
  openai: OpenAI,
) {
  return await chatWithOpenAI(openai, {
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    model,
    temperature,
  });
}
