import { spyFetch } from "#utils/spyFetch.ts";
import { cianParseFromAgent } from "#workflows/cian-parser.ts";
import { sendToTopic, sendToMainChannel } from "#telegram";
import {CIAN_SEARCH_COOKIE} from "#env";
import {Config} from "#config";
import {log} from "#logger";
import { pooledMap } from "@std/async";
import { ensureDirSync } from "@std/fs";

// ----------------------------  KV & очередь  ----------------------------
ensureDirSync("kv");
const kv = await Deno.openKv("kv/cian.sqlite3");
const processingQueue = new Set<string>();
let inProgress = false;
// ------------------------------------------------------------------------

interface CianSearchOfferResponse {
    fullUrl: string;
    exportPdfLink: string;
    description: string;
    photos: { fullUrl: string }[];
    geo: { userInput: string };
}

Deno.cron("Cian Search every 30 min", "*/30 * * * *", run).catch(log.error);
run().catch(log.warn);

async function run() {
    log.debug("Cian Search");

    if (inProgress) {
        log.info("Cian Search is in progress");
        return;
    }

    const config = (await Config.get()).cianSearch;

    const ads: CianSearchOfferResponse[] = [];
    let currentPage = 0;

    // ------------ собираем страницы ------------
    while (true) {
        currentPage++;

        const json = await spyFetch(
            "https://api.cian.ru/lk-specialist/v1/search-offers/",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Cookie: CIAN_SEARCH_COOKIE,
                },
                body: JSON.stringify({
                    _type: "flatrent",
                    engine_version: { type: "term", value: 2 },
                    currency: { type: "term", value: 2 },
                    wp: { type: "term", value: true },
                    for_day: { type: "term", value: "!1" },
                    price: { type: "range", value: { lte: config.maxPrice, gte: config.minPrice} },
                    geo: { type: "geo", value: config.geo.map(id => ({ type: "district", id })) },
                    region: { type: "terms", value: config.regions },
                    sort: { type: "term", value: "total_price_desc" },
                    page: { type: "term", value: currentPage },
                }),
            },
        ).then((resp) => resp.json());

        const offers = json.data.offersSerialized as CianSearchOfferResponse[];
        if (!offers.length) break;
        ads.push(...offers);
    }

    log.debug(`${ads.length} offers found on ${currentPage} pages`);

    inProgress = true;

    // ------------ обрабатываем объявления ------------
    await Array.fromAsync(
        pooledMap(3, ads, handleOffer),   // X = максимальное число «живых» промисов
    );

    inProgress = false;
}

async function handleOffer(offer: CianSearchOfferResponse) {
    // 1) уже сохранено в KV?
    const existsInKv = (await kv.get<boolean>(["offers", offer.fullUrl])).value;
    if (existsInKv) return;

    // 2) уже в процесс-очереди?
    if (processingQueue.has(offer.fullUrl)) return;

    // --> помечаем «в процессе» и сохраняем очередь
    processingQueue.add(offer.fullUrl);

    try {
        log.debug("Processing:", offer.fullUrl);

        const exportUrl = new URL(offer.fullUrl);
        exportUrl.pathname = offer.exportPdfLink;

        const output = await cianParseFromAgent.run({
            exportUrl: exportUrl.toString(),
            images: offer.photos.map((p) => p.fullUrl),
            title: offer.description,
            address: offer.geo.userInput,
            metadata: JSON.stringify(offer),
        });

        await sendToTopic({
            topicKey: output.ratingKey,
            title: output.title,
            message: `${output.message}\n\n🔗 Ссылка: ${offer.fullUrl}`,
            quotes: [output.routes],
            address: output.address,
            imageUrls: output.images,
            lat: output.geo.lat,
            lon: output.geo.lon,
        });

        // записываем факт обработки в KV
        await kv.set(["offers", offer.fullUrl], true);
    } catch (err) {
        // уведомляем о сбое
        log.error(err);
        await sendToMainChannel(`${err}`).catch(log.warn);
        await new Promise((resolve) => setTimeout(resolve, 5_000));
    } finally {
        // снимаем пометку «в процессе» вне зависимости от результата
        processingQueue.delete(offer.fullUrl);
    }
}


if (import.meta.main) {
    await run();
}
