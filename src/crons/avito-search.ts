import {avitoParseFromHtml} from "#workflows/avito-parser.ts";
import { sendToTopic } from "#telegram";
import {Config} from "#config";
import {log} from "#logger";
import { pooledMap } from "@std/async";
import { ensureDirSync } from "@std/fs";

// ----------------------------  KV & очередь  ----------------------------
ensureDirSync("kv");
const kv = await Deno.openKv("kv/avito.sqlite3");
const processingQueue = new Set<string>();
let inProgress = false;
// ------------------------------------------------------------------------

Deno.cron("Avito Search every 30 min", "*/30 * * * *", run).catch(log.error);
run().catch(log.warn);

async function run() {
    log.debug("Avito Search");

    if (inProgress) {
        log.info("Avito Search is in progress");
        return;
    }

    const avitoDiskPath = (await Config.get()).avitoDiskPath;

    const ads: {file: string, html: string}[] = [];

    // ------------ собираем страницы ------------
    for (const entry of Deno.readDirSync(avitoDiskPath)) {
        if (!entry.isFile) {
            log.warn("Not a file:", entry.name);
            continue;
        }

        const text = Deno.readTextFileSync(`${avitoDiskPath}/${entry.name}`);
        ads.push({
            file: entry.name.split('.html')[0],
            html: text,
        });
    }

    log.debug(`[avito] ${ads.length} offers found in path "${avitoDiskPath}"`);

    inProgress = true;

    // ------------ обрабатываем объявления ------------
    await Array.fromAsync(
        pooledMap(3, ads, handleOffer),   // X = максимальное число «живых» промисов
    );

    inProgress = false;
}

async function handleOffer({file: offerKey, html: offer}: {file: string, html: string}) {
    // 1) уже сохранено в KV?
    const existsInKv = (await kv.get<boolean>(["offers", offerKey])).value;
    if (existsInKv) return;

    // 2) уже в процесс-очереди?
    if (processingQueue.has(offerKey)) return;

    // --> помечаем «в процессе» и сохраняем очередь
    processingQueue.add(offerKey);

    try {
        log.debug("Processing:", offerKey);

        const output = await avitoParseFromHtml.run({
            html: offer,
        });

        await sendToTopic({
            topicKey: `${output.ratingKey}-avito`,
            title: output.title,
            message: `${output.message}\n\n🔗 Ссылка: https://avito.ru/all/kvartiry/${offerKey}`,
            quotes: [output.routes],
            address: output.address,
            imageUrls: output.images,
            lat: output.geo.lat,
            lon: output.geo.lon,
        });

        // записываем факт обработки в KV
        await kv.set(["offers", offerKey], true);
    } catch (err) {
        // уведомляем о сбое
        log.error(err);
    } finally {
        // снимаем пометку «в процессе» вне зависимости от результата
        processingQueue.delete(offerKey);
    }
}


if (import.meta.main) {
    await run();
}
