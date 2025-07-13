import { init } from "./worker.ts";

let processing = false;

Deno.cron("check avito every 1 hour", { hour: { every: 1 } }, run).catch(
  console.error,
);

function run() {
  if (processing) {
    console.warn("Ads already processing");
    return;
  }

  console.info("Starting processing");

  processing = true;
  init().catch(console.error).finally(
    () => processing = false,
  );
}

if (import.meta.main) {
  run();
}
