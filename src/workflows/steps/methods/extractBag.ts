import {log} from "#logger";

export interface ExtractedData {
    stops: string;
    routes: string[];
    operators: string[];
    images: string[];
    mergedImage: string;
    description: string;
    title: string;
    address: string;
}

/**
 * Извлекает элементы из «bag» и валидирует их тип.
 * @throws Error если ожидаемый ключ отсутствует или тип неверный.
 */
export function extractBag(bag: Record<string, unknown>): ExtractedData {
    /* --- обязательные строки --- */
    const stops        = bag["getNavigationFromAddress.stops"];
    const mergedImage  = bag["parseAd.mergedImage"];
    const description  = bag["parseAd.description"];
    const title        = bag["parseAd.title"];
    const address      = bag["parseAd.address"];

    if (typeof stops       !== "string") throw new Error("stops is not string");
    if (typeof mergedImage !== "string") throw new Error("mergedImage is not string");
    if (typeof description !== "string") throw new Error("description is not string");
    if (typeof title       !== "string") throw new Error("title is not string");
    if (typeof address     !== "string") throw new Error("address is not string");

    /* --- необязательные массивы строк --- */
    const images       = bag["parseAd.images"];
    const routes    = bag["getNavigationFromAddress.routes"];
    const operators = bag["findOperatorsByAddress.operators"];

    log.debug("findOperatorsByAddress.operators", bag["findOperatorsByAddress.operators"])
    log.debug("findOperatorsByAddress", bag["findOperatorsByAddress"])

    if (images && !Array.isArray(images)) {
        throw new Error("images must be string[]");
    }
    if (routes && !Array.isArray(routes)) {
        throw new Error("routes must be string[]");
    }
    if (operators && !Array.isArray(operators)) {
        throw new Error("operators must be string[]");
    }

    return {
        stops,
        mergedImage,
        description,
        title,
        address,
        images: images as string[]  ?? [],
        routes:    routes as string[]  ?? [],
        operators: operators as string[]  ?? [],
    };
}

export function removeCodeBlock(source: string): string {
    let startSub = 0;
    let endSub = source.length;
    if (source.startsWith('```')) startSub = source.split('\n')[0].length;
    if (source.endsWith('```')) endSub = source.length - '```'.length;

    return source.substring(startSub, endSub).trim();
}

/* ---------------- Пример ---------------- */
if (import.meta.main) {
    const bag = {
        "getNavigationFromAddress.stops": "ост. Перекрёсток",
        "getNavigationFromAddress.routes": ["12", "29"],
        "findOperatorsByAddress.operators": ["BUS-CITY"],
        "parseAd.mergedImage": "data:image/jpeg;base64,...",
        "parseAd.description": "Двухкомнатная…",
        "parseAd.title": "Квартира у метро",
        "parseAd.address": "г. Краснодар, ул. Ставропольская…",
    };

    console.info(extractBag(bag));
}
