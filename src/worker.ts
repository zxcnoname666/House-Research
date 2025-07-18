import { type Browser, launch, type Page, type ElementHandle } from "jsr:@astral/astral";
import { ensureDir, existsSync } from "jsr:@std/fs";

await ensureDir("json");
const COOKIE_FILE = "json/cookies.json";
const ADS_URL_FILE = "json/ads.json";
const ads: string[] = [];

/** Пишем куки текущей страницы в JSON-файл */
export async function saveCookies(page: Page, file = "cookies.json") {
  const cookies = await page.cookies();
  const data = JSON.stringify(cookies, null, 2);
  await Deno.writeTextFile(file, data);
}

/** Загружаем куки из файла и подставляем в новую страницу */
export async function restoreCookies(page: Page, file = "cookies.json") {
  const raw = await Deno.readTextFile(file);
  const cookies = JSON.parse(raw);
  await page.setCookies(cookies);
}

export async function init(parseAds: boolean = true) {
  const headless = Deno.env.get("HEADLESS") === "true";
  await using browser = await launch(
    headless
      ? {
        headless: true,
        args: [
          "--headless=new",
          "--ozone-platform=none",
          "--disable-features=UseOzonePlatform",
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
        ],
      }
      : { headless: false },
  );

  ads.length = 0;

  if (parseAds) {
    await parseList(browser).catch(console.error);
  } else {
    ads.push(...JSON.parse(await Deno.readTextFile(ADS_URL_FILE)));
  }

  await ensureDir("export");
  for (const file of Deno.readDirSync("export")) {
    const fileName = file.name.split(".html")[0];
    if (ads.some((x) => x.includes(fileName))) continue;
    console.info("🎗️ Removing ", file.name);
    Deno.removeSync(`export/${file.name}`);
  }

  for (const url in ads) {
    console.info(`🍞 Processing ${Number.parseInt(url) + 1}/${ads.length}`);
    await parseAd(browser, ads[url]).catch(console.error);
  }

  console.info("🔗 All done");
}

export async function parseAd(browser: Browser, url: string) {
  const urlPath = new URL(url).pathname.split("/");
  const exportPath = `export/${urlPath[urlPath.length - 1]}.html`;

  if (existsSync(exportPath)) {
    console.info(`⚠️ File "${exportPath}" already exists`);
    return;
  }

  await using page = await browser.newPage();
  console.debug("page");

  await firstLoad(page);
  console.debug("firstLoad");
  await page.goto(url);
  console.debug("goto");
  await checkBlocking(page);
  console.debug("checkBlocking");

  await page.waitForNetworkIdle({ idleConnections: 0, idleTime: 1000 });
  console.debug("network idle");

  const title = await page.evaluate(() => {
    // @ts-expect-error — DOM, браузерный код.
    return document.title;
  });
  if (title.includes("Ошибка 404")) {
    console.warn("Page is 404");
    return;
  }

  const warning = await page.$('div[data-marker="item-view/closed-warning"]');
  if (
    warning &&
    (await warning.innerText()).toLowerCase().includes("снято с публикации")
  ) {
    console.warn("Ad is closed");
    return;
  }

  const html = await page.content();
  await ensureDir("export");
  await Deno.writeTextFile(exportPath, html); // --allow-write
  console.info(`✅ ${exportPath} saved`);
}

export async function parseList(browser: Browser) {
  console.debug("parseList");

  await using page = await browser.newPage();
  console.debug("page");

  await page.setViewportSize({ width: 1920, height: 1080 });
  console.debug("setViewportSize");

  await firstLoad(page);
  console.debug("firstLoad");
  await page.goto(Deno.env.get("AVITO_URL")!);
  console.debug("goto");

  console.debug("reading ads");

  if (await page.$("div[data-marker=\"map-full\"]")) {
    await parseMapList(page);
  } else {
    await parseBasicList(page);
  }

  console.debug(ads.length, "ads");

  await saveCookies(page, COOKIE_FILE);

  await Deno.writeTextFile(ADS_URL_FILE, JSON.stringify(ads, null, 2));
}

async function parseMapList(page: Page) {
  const listSel = '*[itemType="http://schema.org/Product"]';

  await smartScrollAstral(page, listSel);
  console.debug("smartScroll");

  const offersRoot = await page.$$(listSel);
  console.debug("offersRoot", offersRoot.length);

  const offersUrls = await getLinks(offersRoot);
  ads.push(...offersUrls);
  console.debug(ads.length, "ads");
}

async function parseBasicList(page: Page) {
  while (true) {
    await checkBlocking(page);

    const offersRoot = await page.$$('*[itemType="http://schema.org/Product"]');
    const offersUrls = await getLinks(offersRoot);
    ads.push(...offersUrls);

    await fastRandomScroll(page);
    console.debug("random scroll");

    const nextButton = await page.$('*[aria-label="Следующая страница"]');
    if (!nextButton) break;
    await nextButton.click();

    console.debug("nextButton clicked");
    await page.waitForNavigation({ waitUntil: "load" });
    console.debug("page is loaded");
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
}

async function firstLoad(page: Page) {
  await restoreCookies(page, COOKIE_FILE)
    .catch(console.debug);
}

async function getLinks(items: ElementHandle[]) {
  const offersLinks = await Promise.all(
      items.map((el) => el.$("a[href]")),
  );
  const offersAttributes = await Promise.all(
      offersLinks.map((a) => a?.getAttribute("href")),
  );
  const offersUrls = offersAttributes.filter((a) =>
      a && a?.includes("/kvartiry/")
  )
      .map((url) => {
        if (!url) return null;
        if (url.includes("avito.ru/")) return url;
        return `https://avito.ru/${url}`.replace(/\/\//g, "/");
      })
      .filter(Boolean) as string[];

  console.debug(offersUrls.length, "offersUrls");

  return offersUrls;
}

async function checkBlocking(page: Page) {
  let blocked = false;
  while (await page.$(".firewall-container")) {
    if (!blocked) {
      console.error("😥 firewall blocked, bypass captcha manually...");
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    blocked = true;
  }

  if (blocked) {
    console.debug("firewall blocked");
    await page.waitForNavigation({ waitUntil: "load" });
    console.debug("page is loaded");
    await saveCookies(page, COOKIE_FILE);
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
}

export async function fastRandomScroll(page: Page) {
  await page.evaluate(async () => {
    const rand = (min: number, max: number) =>
      Math.random() * (max - min) + min;

    // @ts-expect-error — DOM, браузерный код.
    const target = document.scrollingElement ?? document.documentElement;
    const start = performance.now();

    // @ts-expect-error — DOM, браузерный код.
    while (target.scrollTop + innerHeight < target.scrollHeight) {
      // случайный шаг 250-450 px
      const step = rand(250, 450);
      // @ts-expect-error — DOM, браузерный код.
      // deno-lint-ignore no-window
      window.scrollBy({ top: step, behavior: "auto" });

      // случайная очень короткая пауза 10-35 мс
      await new Promise((r) => setTimeout(r, rand(10, 35)));

      // safety-break ‒ не крутить дольше 15 сек, если что-то пошло не так
      if (performance.now() - start > 15_000) break;
    }
  });
}
/**
 * Скроллит контейнер рандомными рывками, пока внутри
 * появляются новые элементы или не пройдёт 10 с без прироста.
 *
 * @param page        — открытая страница Astral
 * @param item        — селектор «карточки», за числом которых следим
 */
export async function smartScrollAstral(
    page: Page,
    item: string = '*[itemType="http://schema.org/Product]"',
): Promise<number> {
  // 1. Ждём сам контейнер и «ставим» курсор внутрь
  console.log("item", item)
  const box = await page.waitForSelector(item);
  const rect = await box.boundingBox();
  if (!rect) throw new Error("Container is not visible");
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);  // фокус на блок

  // 2. Функции случайного шага и паузы
  const rnd = (min: number, max: number) =>
      Math.floor(Math.random() * (max - min + 1)) + min;

  let lastCount = (await page.$$(item)).length;  // сколько карточек было
  let idleMs    = 0;                            // сколько времени прироста нет

  // 3. Главный цикл
  while (idleMs < 10_000) {                     // 10 секунд без прироста — стоп
    const step  = rnd(1400, 1850);                // пикселей колёсиком
    const pause = rnd(300, 900);                // задержка после прокрутки

    await page.mouse.wheel({ deltaY: step });   // прокрутка контейнера
    await page.waitForTimeout(pause);           // пауза (надёжнее, чем setTimeout)

    const curr = (await page.$$(item)).length;   // пересчитываем элементы
    console.debug(curr, "curr", lastCount, "lastCount");
    if (curr > lastCount) {
      lastCount = curr;                         // есть новые → сброс счётчика
      idleMs = 0;
    } else {
      idleMs += pause;                          // прироста нет → копим «пустое» время
    }
  }

  console.log(lastCount, "lastCount")
  return lastCount;                             // итоговое число карточек
}
