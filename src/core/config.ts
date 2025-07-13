// deno-lint-ignore-file no-explicit-any
import { ensureDir, existsSync } from "@std/fs";
import { dirname } from "@std/path";
import YAML from "yaml";

export interface AppConfig {
  importantLocations: {
    name: string;
    lat: string;
    lon: string;
  }[];
  cianSearch: {
    maxPrice: number;
    minPrice: number;
    geo: number[];
    regions: number[];
  };
  avitoDiskPath: string;
  logLevel: "trace" | "debug" | "info" | "warn" | "error";
}

const DEFAULT_CONFIG: AppConfig = {
  importantLocations: [
    { name: "Офис", lat: "55.751017", lon: "37.617261" },
    { name: "Храм", lat: "55.744635", lon: "37.605634" },
  ],
  cianSearch: {
    maxPrice: 50_000,
    minPrice: 0,
    geo: [0, 1, 2],
    regions: [1],
  },
  avitoDiskPath: "/root/utils/avito-export",
  logLevel: "info",
};

/**
 * Класс‑singleton для работы с конфигурацией.
 */
export class Config {
  private static readonly path = "./conf/conf.yml";
  private static instance: AppConfig;

  /** Получить актуальную конфигурацию (ленивая загрузка). */
  static async get(): Promise<AppConfig> {
    if (!this.instance) {
      await this.load();
    }
    return this.instance;
  }

  /** Принудительно перечитать файл с диска. */
  static async reload(): Promise<AppConfig> {
    await this.load();
    return this.instance;
  }

  /** Внутренняя логика чтения/merge/сохранения. */
  private static async load(): Promise<void> {
    if (!existsSync(this.path)) {
      // Файл отсутствует — создаём целиком из дефолтов (без комментариев)
      await ensureDir(dirname(this.path));
      await Deno.writeTextFile(this.path, YAML.stringify(DEFAULT_CONFIG));
      this.instance = { ...DEFAULT_CONFIG };
      return;
    }

    const text = await Deno.readTextFile(this.path);
    let doc = YAML.parseDocument(text, { keepSourceTokens: true });

    // YAML.parseDocument всегда возвращает документ.
    // Если файл был пустой/битый, doc.contents может быть undefined.
    if (!doc.contents) {
      doc = YAML.parseDocument("{}", { keepSourceTokens: true });
    }

    let parsed: Partial<AppConfig> = {};
    try {
      parsed = doc.toJS() as Partial<AppConfig>;
    } catch (err) {
      console.error("[Config] YAML parse error, используя defaults", err);
    }

    // Глубокий merge, который получит приложение
    this.instance = this.deepMerge(DEFAULT_CONFIG, parsed);

    // Аккуратно дописываем недостающие ключи в AST, чтобы не терять комментарии
    this.applyDefaultsToDoc(doc, DEFAULT_CONFIG);

    // Сохраняем только если документ действительно изменился
    // (иначе перезапись при каждом запуске мешает git‑diff'у)
    const serialized = doc.toString();
    if (serialized !== text) {
      await Deno.writeTextFile(this.path, serialized);
    }
  }

  /**
   * Рекурсивно добавляет недостающие по сравнению с defaults ключи в YAML AST.
   * Существующие комментарии/форматирование затрагиваются минимально.
   */
  private static applyDefaultsToDoc(node: any, defaults: any): void {
    if (typeof defaults !== "object" || defaults === null) return;

    for (const [key, defVal] of Object.entries(defaults)) {
      if (!node.has?.(key)) {
        // Ключа нет — просто пишем дефолтный JS‑узел (yaml сам
        // сконвертирует его в подходящий Node и поставит без комментариев)
        node.set(key, defVal);
      } else if (
        defVal && typeof defVal === "object" && !Array.isArray(defVal)
      ) {
        // Ключ есть и это объект — углубляемся
        const child = node.get(key, true /* keepScalar */);
        this.applyDefaultsToDoc(child, defVal);
      }
    }
  }

  /**
   * deepMerge строит итоговый объект конфигурации.
   */
  private static deepMerge<T>(
    defaults: T,
    provided: Partial<T> | undefined,
  ): T {
    if (!provided) return { ...(defaults as any) };

    const result: any = Array.isArray(defaults)
      ? [...(defaults as any)]
      : { ...(defaults as any) };

    for (const key in defaults as any) {
      if (Object.prototype.hasOwnProperty.call(provided, key)) {
        const defVal: any = (defaults as any)[key];
        const provVal: any = (provided as any)[key];

        if (
          defVal &&
          typeof defVal === "object" &&
          !Array.isArray(defVal) &&
          provVal &&
          typeof provVal === "object" &&
          !Array.isArray(provVal)
        ) {
          result[key] = this.deepMerge(defVal, provVal);
        } else {
          result[key] = provVal;
        }
      }
    }

    return result as T;
  }
}
