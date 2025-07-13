import { z } from "zod";
import {Step} from "workflow-core";
import searchTelecom from "#ai-agents/prompts/search-telecom.ts";
import { DOMParser } from "dom-parser";
import parseOperators from "#ai-agents/prompts/parse-operators.ts";
import {safeFreeAi} from "./methods/ai.ts";
import {parseAddress} from "./methods/coords.ts";
import {spyFetch} from "#utils/spyFetch.ts";
import {removeCodeBlock} from "./methods/extractBag.ts";
import { log } from "#logger";

export default new Step<
    { address: string },
    { operators: string[] }
>({
    id: "findOperatorsByAddress",
    inputSchema: z.object({ address: z.string() }),
    outputSchema: z.object({ operators: z.array(z.string()) }),
    async execute({ address }) {
        log.debug("run step");
        try {
            return { operators: await runStep(address) };
        } catch(err) {
            log.error(err);
            return { operators: [] };
        }
    },
});

async function runStep(address: string): Promise<string[]> {
    const parsedAddress = await parseAddress(address);
    log.debug("parsedAddress:", parsedAddress);
    const data = await safeSearch(parsedAddress);
    log.debug("data...");
    const slug = await safeFreeAi(searchTelecom, `${address}\n---\n${data}`);
    log.debug("slug:", slug);
    const rawOperators = await getRawOperators(slug);
    log.debug("rawOperators:", rawOperators);
    const aiOperators = await safeFreeAi(parseOperators, rawOperators);
    log.debug("aiOperators:", aiOperators);
    const operators = JSON.parse(removeCodeBlock(aiOperators));
    if (!Array.isArray(operators)) throw new Error("broken array");
    return operators;
}

async function getRawOperators(slug: string): Promise<string> {
    const res = await spyFetch(`https://gde-luchshe.ru/${slug}`);
    const html = await res.text();

    const doc = new DOMParser().parseFromString(html, "text/html");
    if (!doc) throw new Error("broken markup");

    const text = doc.querySelector('div[class*="AddressTariff_currentAddress"]')?.textContent.replace("изменить адрес", "");
    return text ?? "N/A";
}

async function safeSearch(address: string): Promise<string> {
    let data = await searchAddress(address);

    try {
        const json = JSON.parse(data);
        if (!json.length) {
            data = await searchAddress(address.split(",").slice(0, -1).join(","));
        }
    } catch (e) {
        log.debug(e);
    }

    return data;
}

async function searchAddress(address: string): Promise<string> {
    const res = await spyFetch(`https://bff.gdelu.ru/api/v1/suggest/addr?context=specify&term=${encodeURI(address)}`);
    return await res.text();
}


if (import.meta.main) {
    const address = "Краснодарский край, Краснодар, Карасунский, мкр. Черемушки, Ставропольская ул., 113";
    console.info("address:", address);
    const parsedAddress = await parseAddress(address);
    console.info("parsedAddress:", parsedAddress);
    const data = await safeSearch(parsedAddress);
    console.info("data:", data);
    const slug = await safeFreeAi(searchTelecom, `${address}\n---\n${data}`);
    console.info("slug:", slug);
    const rawOperators = await getRawOperators(slug);
    console.info("rawOperators:", rawOperators);
    const aiOperators = await safeFreeAi(parseOperators, rawOperators);
    console.info("aiOperators:", aiOperators);
    const operators = JSON.parse(aiOperators);
    console.info("operators:", operators);
    if (!Array.isArray(operators)) throw new Error("broken array");
}