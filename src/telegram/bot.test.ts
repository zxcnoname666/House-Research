import { Bot } from "./deps.ts";
import { sendToTopic } from "./topic.ts";
import { sendToMainChannel } from "./channel.ts";
import { BOT_TOKEN } from "#env";

const botTest = new Bot(BOT_TOKEN);

// /topic <текст>
botTest.command("topic", async (ctx) => {
  const msg = ctx.match || "Привет из новой темы!";
  await sendToTopic(botTest, ctx.chat.id, {
    topicKey: "reports-2025",
    title: "🗂 Отчёты 2025",
    message: msg,
    address: "тест",
    imageUrls: ["https://images.cdn-cian.ru/images/2554865143-1.jpg"],
    lat: 60.1699,
    lon: 24.9384,
    quotes: [],
  });
  await ctx.reply("Отправлено в тему!");
});

// /broadcast <текст>
botTest.command("broadcast", async (ctx) => {
  console.info(ctx.chat.id);
  await sendToMainChannel(botTest, ctx.chat.id, ctx.match);
  await ctx.reply("Опубликовано в общий поток.");
});

botTest.start();
