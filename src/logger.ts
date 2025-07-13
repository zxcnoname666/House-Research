// deno-lint-ignore-file no-explicit-any
import { Config } from "#config";
import { AsyncLocalStorage } from "node:async_hooks";
import { Step, Workflow } from "workflow-core";

type Ctx = {
  runId?: string; // UUID одного запуска
  method?: "CRON" | "WORKFLOW"; // источник вызова
  workflowName?: string; // имя воркфлоу
  stepId?: string; // id шага
};

const als = new AsyncLocalStorage<Ctx>();

const level = await (async () => {
  switch ((await Config.get()).logLevel) {
    case "trace":
      return 4;
    case "debug":
      return 3;
    case "info":
      return 2;
    case "warn":
      return 1;
    case "error":
      return 0;
    default:
      return 2;
  }
})();

function resolveMethodCallName(): string {
  const stack = new Error().stack ?? "";
  const lines = stack.split("\n").slice(4); // пропускаем Error, текущий кадр, pfx и log
  for (const l of lines) {
    const match = l.match(/at\s+([^\s(]+)\s*\(/);
    if (match) {
      const fn = match[1];
      // отфильтровываем собственные методы логгера
      if (!fn.startsWith("log.")) return fn;
    }
  }
  return "-";
}

function pfx(type: string): string {
  const {
    runId = "-",
    method = "-",
    workflowName = "-",
    stepId = "-",
  } = als.getStore() ?? {};
  const methodCallName = resolveMethodCallName();
  return `[${
    new Date().toISOString()
  }] [${type}] [${runId}] [${method}] [${workflowName}] [${stepId}] [${methodCallName}]`;
}

export const log = {
  trace(msg: unknown, ...args: unknown[]) {
    if (level >= 4) console.debug(pfx("trace"), msg, ...args);
  },
  debug(msg: unknown, ...args: unknown[]) {
    if (level >= 3) console.debug(pfx("debug"), msg, ...args);
  },
  info(msg: unknown, ...args: unknown[]) {
    if (level >= 2) console.info(pfx("info"), msg, ...args);
  },
  warn(msg: unknown, ...args: unknown[]) {
    if (level >= 1) console.warn(pfx("warn"), msg, ...args);
  },
  error(msg: unknown, ...args: unknown[]) {
    if (level >= 0) console.error(pfx("error"), msg, ...args);
  },

  set(partial: Partial<Ctx>) {
    als.enterWith({ ...(als.getStore() ?? {}), ...partial });
  },
};

function withCtx<T>(patch: Ctx, fn: () => T | Promise<T>) {
  return als.run({ ...(als.getStore() ?? {}), ...patch }, fn);
}

const origCron = (Deno as any).cron;
if (typeof origCron === "function") {
  (Deno as any).cron = function (name: string, tab: string, cb: () => unknown) {
    return origCron.call(
      Deno,
      name,
      tab,
      () =>
        withCtx({
          runId: crypto.randomUUID(),
          method: "CRON",
          workflowName: "-",
          stepId: "-",
        }, cb),
    );
  };
}

const origWfRun = Workflow.prototype.run;
Workflow.prototype.run = function (
    // @ts-expect-error its work
    this: Workflow<any, any>,
    trigger: unknown,
): any {
  const wfName = (this as any).name ?? "-";
  return withCtx({
    runId: crypto.randomUUID(),
    method: "WORKFLOW",
    workflowName: wfName,
    stepId: "-",
  }, () => origWfRun.call(this, trigger));
};

// @ts-expect-error its work
const origStepRun = Step.prototype.run as Step<any, any>["run"];
Step.prototype.run = function (
  // @ts-expect-error its work
  this: Step<any, any>,
  ctx: unknown,
  bag: Record<string, unknown>,
) {
  return withCtx({ stepId: this.id }, () => origStepRun.call(this, ctx, bag));
};

log.info("Logger started");
