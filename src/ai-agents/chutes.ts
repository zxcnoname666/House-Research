import {chatWithOpenAI, createOpenAi} from "./core_fetch.ts";
import {CHUTES_API_KEY} from "#env";

const openai = createOpenAi({
    apiKey: CHUTES_API_KEY,
    endpoint: "https://llm.chutes.ai/v1"
});

export async function chat(systemPrompt: string, userPrompt: string, temperature: number = 0.7) {
    return await chatWithOpenAI(openai, {
        messages: [
            {role: "system", content: systemPrompt},
            {role: "user", content: userPrompt}
        ],
        model: "deepseek-ai/DeepSeek-R1",
        temperature
    })
}
