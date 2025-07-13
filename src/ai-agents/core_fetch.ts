/**
 * Отправляет запрос к OpenAI Chat Completion API,
 * удаляя все think-блоки из пользовательского сообщения.
 */
import OpenAI from "openai";

export interface ChatRequest {
  messages: { role: "system" | "user" | "assistant"; content: string }[];
  model?: string;
  temperature?: number;
  max_tokens?: number;
}

const REASONING_TAGS = /<\s*(think|tool|output)[\s\S]*?<\/\s*\1\s*>/gi;
/**
 * Удаляет think-блоки, оформленные как ```think...``` или <think>...</think>
 */
export function stripReasoning(text: string): string {
  return text.replace(REASONING_TAGS, "").trim();
}

export function createOpenAi(server: { apiKey: string; endpoint?: string }) {
  if (!server.apiKey) {
    throw new Error("Environment variable <TYPE>_API_KEY is not set");
  }

  // Инициализация клиента
  return new OpenAI({
    apiKey: server.apiKey,
    ...(server.endpoint ? { baseURL: server.endpoint } : {}),
  });
}

/**
 * Выполняет запрос к OpenAI через официальный npm-клиент.
 */
export async function chatWithOpenAI(
  openai: OpenAI,
  request: ChatRequest,
): Promise<string> {
  const { messages, model, temperature, max_tokens } = request;

  // Отправка запроса
  const completion = await openai.chat.completions.create({
    model: model ?? "gpt-4o-mini",
    messages,
    temperature: temperature ?? 0.7,
    max_tokens: max_tokens,
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error("OpenAI API returned empty response");
  }

  return stripReasoning(content);
}
