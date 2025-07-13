export const CHUTES_API_KEY = Deno.env.get("CHUTES_API_KEY")!;
export const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY")!.split(',');
export const NVIDIA_API_KEY = Deno.env.get("NVIDIA_API_KEY")!.split(',');

export const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!.split(',');
export const GEMINI_ENDPOINT = Deno.env.get("GEMINI_ENDPOINT")!;
export const GEMINI_CHAT_ENDPOINT = Deno.env.get("GEMINI_CHAT_ENDPOINT") ?? GEMINI_ENDPOINT;

export const RAPID_API_KEY = Deno.env.get("RAPID_API_KEY")!.split(',');

export const CIAN_SEARCH_COOKIE = Deno.env.get("CIAN_SEARCH_COOKIE") ?? "";
export const BOT_TOKEN = Deno.env.get("BOT_TOKEN")!;
export const TELEGRAM_CHAT_ID = Deno.env.get("TELEGRAM_CHAT_ID")!;
