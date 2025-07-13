import { chat as chutesChat } from "#ai-agents/chutes.ts";
import { chat as nvidiaChat } from "#ai-agents/nvidia.ts";
import { chat as openChat } from "#ai-agents/openrouter.ts";
import {
  chat as geminiChat,
  chatLite as geminiChatLite,
} from "#ai-agents/gemini.ts";
import { deadline } from "@std/async";
import { log } from "#logger";

const TIMEOUT = 240_000;

export async function safeFreeAi(
  systemPrompt: string,
  userPrompt: string,
  temperature: number = 0,
): Promise<string> {
  try {
    return await geminiChatLite(systemPrompt, userPrompt, temperature);
  } catch {
    return await safeFreeThink(systemPrompt, userPrompt, temperature);
  }
}

export async function safeFreeThink(
  systemPrompt: string,
  userPrompt: string,
  temperature: number = 0,
): Promise<string> {
  try {
    return await deadline(
      openChat(systemPrompt, userPrompt, temperature),
      TIMEOUT,
    );
  } catch (err) {
    log.trace(err);
    log.debug("openRouter failed");
  }

  for (let i = 0; i < 3; i++) {
    try {
      return await Promise.any([
        deadline(chutesChat(systemPrompt, userPrompt, temperature), TIMEOUT),
        deadline(nvidiaChat(systemPrompt, userPrompt, temperature), TIMEOUT),
      ]);
    } catch (err) {
      log.debug(err);
    }

    try {
      return await deadline(
        openChat(systemPrompt, userPrompt, temperature),
        TIMEOUT,
      );
    } catch (err) {
      log.debug(err);
    }

    await new Promise((resolve) => setTimeout(resolve, i * 3_000));
  }

  log.warn("Free Think failed");
  return await geminiChat(systemPrompt, userPrompt, temperature);
}
