import OpenAI from "openai";
import {chatWithOpenAI, createOpenAi} from "./core_fetch.ts";
import {NVIDIA_API_KEY} from "#env";
import {log} from "#logger";

const openAiInstances = new Set<OpenAI>();
for (const key of NVIDIA_API_KEY) {
    const openai = createOpenAi({
        apiKey: key,
        endpoint: "https://integrate.api.nvidia.com/v1"
    });
    openAiInstances.add(openai);
}

log.info("NVIDIA API instances:", openAiInstances.size);

export async function chat(systemPrompt: string, userPrompt: string, temperature: number = 0.7) {
    for (const openai of openAiInstances) {
        try {
            return await chatWithOpenAI(openai, {
                messages: [
                    {role: "system", content: systemPrompt},
                    {role: "user", content: userPrompt}
                ],
                model: "deepseek-ai/deepseek-r1",
                temperature
            })
        } catch (err) {
            log.trace(err);
        }
    }

    throw new Error("No models");
}
