import { autoRetry, Bot } from "./deps.ts";
import {
  sendToTopic as _sendToTopic,
  type SendToTopicOptions,
} from "./topic.ts";
import { sendToMainChannel as _sendToMainChannel } from "./channel.ts";
import { BOT_TOKEN, TELEGRAM_CHAT_ID } from "#env";

const bot = new Bot(BOT_TOKEN);
bot.api.config.use(autoRetry());
bot.start();

export const sendToTopic = (opts: SendToTopicOptions) =>
  _sendToTopic(bot, TELEGRAM_CHAT_ID, opts);

export const sendToMainChannel = (text: string) =>
  _sendToMainChannel(bot, TELEGRAM_CHAT_ID, text);
