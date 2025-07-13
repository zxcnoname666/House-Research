import { type Browser, launch, type Page } from "jsr:@astral/astral";
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
  await using browser = await launch({
    headless: Deno.env.get("HEADLESS") === "true",
  });

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
    console.info(`🍞 Processing ${url + 1}/${ads.length}`);
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

  await firstLoad(page);
  console.debug("firstLoad");
  await page.goto(Deno.env.get("AVITO_URL")!);
  console.debug("goto");

  console.debug("reading ads");

  while (true) {
    await checkBlocking(page);

    const offersRoot = await page.$$('*[itemType="http://schema.org/Product"]');
    const offersLinks = await Promise.all(
      offersRoot.map((el) => el.$("a[href]")),
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

  console.debug(ads.length, "ads");

  await saveCookies(page, COOKIE_FILE);

  await Deno.writeTextFile(ADS_URL_FILE, JSON.stringify(ads, null, 2));
}

async function firstLoad(page: Page) {
  await restoreCookies(page, COOKIE_FILE)
    .catch(console.debug);
}

async function checkBlocking(page: Page) {
  let blocked = false;
  while (await page.$(".firewall-container")) {
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
