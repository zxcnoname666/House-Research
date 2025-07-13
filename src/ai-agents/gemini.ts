import {chatWithOpenAI, createOpenAi} from "./core_fetch.ts";
import {GoogleGenAI, createUserContent, createPartFromUri, type Part} from 'genai';
import readPdf from "./prompts/read-pdf.ts";
import {spyFetch} from "#utils/spyFetch.ts";
import OpenAI from "openai";
import {GEMINI_API_KEY, GEMINI_CHAT_ENDPOINT, GEMINI_ENDPOINT} from "#env";
import {log} from "#logger";

const openAiInstances = new Set<OpenAI>();
const genAiInstances = new Set<GoogleGenAI>();

for (const key of GEMINI_API_KEY) {
    const openai = createOpenAi({
        apiKey: key,
        endpoint: `${GEMINI_CHAT_ENDPOINT}/v1beta/openai`
    });
    const genAi = new GoogleGenAI({
        apiKey: key,
        httpOptions: {
            baseUrl: GEMINI_ENDPOINT
        }
    });

    openAiInstances.add(openai);
    genAiInstances.add(genAi);
}

log.info("GEMINI API instances:", openAiInstances.size);


export async function chat(systemPrompt: string, userPrompt: string, temperature: number = 0.7) {
    return await localChat(systemPrompt, userPrompt, temperature, "gemini-2.5-flash");
}

export async function chatLite(systemPrompt: string, userPrompt: string, temperature: number = 0.7) {
    return await localChat(systemPrompt, userPrompt, temperature, "gemini-2.0-flash");
}

async function localChat(systemPrompt: string, userPrompt: string, temperature: number = 0.7, model: string = "gemini-2.5-pro") {
    for (const openai of openAiInstances) {
        try {
            return await chatWithOpenAI(openai, {
                messages: [
                    {role: "system", content: systemPrompt},
                    {role: "user", content: userPrompt}
                ],
                model,
                temperature
            })
        } catch (e) {
            log.trace(e);
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }

    throw new Error("No openai instances");
}

export async function uploadFilesAndCustomRun<O>(url: string[] = [], fn: (parts: Part[], genAI: GoogleGenAI) => Promise<O>): Promise<O> {
    for (const genAi of genAiInstances) {
        try {
            return await uploadFilesAndCustomRunWithModel(url, genAi, fn);
        } catch (e) {
            log.trace(e);
            await new Promise(resolve => setTimeout(resolve, 1_000));
        }
    }

    throw new Error("No genai instances");
}
export async function uploadFilesAndCustomRunWithModel<O>(url: string[] = [], genAi: GoogleGenAI, fn: (parts: Part[], genAI: GoogleGenAI) => Promise<O>): Promise<O> {
    const files = await Promise.all(url.map(async (url) => {
        const res = await spyFetch(url);
        if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
        const bytes = new Uint8Array(await res.arrayBuffer());

        return await genAi.files.upload({
            file: new Blob([bytes]),
            config: {
                mimeType: res.headers.get("Content-Type")?.split(';')[0] ?? "application/octet-stream",
            }
        });
    }));

    const parts = files.map(file => createPartFromUri(file.uri ?? "", file.mimeType ?? ""));

    try {
        return await fn(parts, genAi);
    } finally {
        for (const file of files) {
            await genAi.files.delete({name: file.name ?? ""})
        }
    }
}

export async function pasteFileAndProWebAsk(systemPrompt: string, userPrompt: string, file: { mimeType: string, base64: string }, temperature: number = 0.7) {
    try {
        return await localPasteFileAndWebAsk(systemPrompt, userPrompt, file, temperature, "gemini-2.5-pro");
    } catch (e) {
        log.trace(e);
        await new Promise(resolve => setTimeout(resolve, 5_000));
        return await localPasteFileAndWebAsk(systemPrompt, userPrompt, file, temperature, "gemini-2.5-pro");
    }
}

export async function pasteFileAndFlashWebAsk(systemPrompt: string, userPrompt: string, file: { mimeType: string, base64: string }, temperature: number = 0.7) {
    try {
        return await localPasteFileAndWebAsk(systemPrompt, userPrompt, file, temperature, "gemini-2.5-flash");
    } catch (e) {
        log.trace(e);
        await new Promise(resolve => setTimeout(resolve, 5_000));
        return await localPasteFileAndWebAsk(systemPrompt, userPrompt, file, temperature, "gemini-2.5-flash");
    }
}

export async function pasteFileAndLiteFlashWebAsk(systemPrompt: string, userPrompt: string, file: { mimeType: string, base64: string }, temperature: number = 0.7) {
    try {
        return await localPasteFileAndWebAsk(systemPrompt, userPrompt, file, temperature, "gemini-2.0-flash");
    } catch (e) {
        log.trace(e);
        await new Promise(resolve => setTimeout(resolve, 5_000));
        return await localPasteFileAndWebAsk(systemPrompt, userPrompt, file, temperature, "gemini-2.0-flash");
    }
}

async function localPasteFileAndWebAsk(systemPrompt: string, userPrompt: string, { mimeType, base64 }: { mimeType: string, base64: string }, temperature: number = 0.7, model: string = "gemini-2.5-pro" ) {
    for (const genAi of genAiInstances) {
        try {
            const result = await genAi.models.generateContent({
                model: model,
                config: {
                    tools: [{ googleSearch: {} }],
                    systemInstruction: systemPrompt,
                    temperature,
                    thinkingConfig: {
                        thinkingBudget: -1,
                    },
                },
                contents: [
                    { inlineData: { mimeType, data: base64 } },
                    { text: userPrompt },
                ],
            });

            return result.text;
        } catch (e) {
            log.trace(e);
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }

    throw new Error("No genai instances");
}

export async function uploadFilesAndChat(systemPrompt: string, userPrompt: string = "", url: string[] = [], temperature: number = 0.7) {
    return await uploadFilesAndCustomRun(url, async (parts, genAi) => {
        const result = await genAi.models.generateContent({
            model: "gemini-2.5-flash",
            config: {
                systemInstruction: systemPrompt,
                temperature,
                thinkingConfig: {
                    thinkingBudget: -1,
                },
            },
            contents: createUserContent([
                ...parts,
                userPrompt,
            ]),
        });

        return result.text;
    });
}

if (import.meta.main) {
    log.info(await uploadFilesAndChat(readPdf, "", ["https://cian.ru/export/pdf/rent/flat/319554040/"], 0))
}