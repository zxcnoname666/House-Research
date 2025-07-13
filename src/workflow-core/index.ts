// deno-lint-ignore-file no-explicit-any no-unused-vars no-inferrable-types
import { ZodType } from "zod";

const __ = (() => {
    const p = (...c: (string | number)[]) => c.join("");

    const f_isPlain = (o: unknown): o is Record<string, unknown> =>
        typeof o === "object" && o !== null && !Array.isArray(o);

    const f_deepMerge = <
        A extends Record<string, unknown>,
        B extends Record<string, unknown>,
    >(
        a: A,
        b: B,
    ): A & B => {
        const out = { ...a } as Record<string, unknown>;
        for (const [k, v] of Object.entries(b)) {
            if (f_isPlain(v) && f_isPlain(out[k])) {
                out[k] = f_deepMerge(out[k] as Record<string, unknown>, v);
            } else {
                out[k] = v;
            }
        }
        return out as A & B;
    };

    const f_flatten = (
        o: unknown,
        prefix = "",
    ): Record<string, unknown> => {
        if (!f_isPlain(o)) return {};
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(o)) {
            const key = prefix ? `${prefix}.${k}` : k;
            if (f_isPlain(v)) Object.assign(out, f_flatten(v, key));
            else out[key] = v;
        }
        return out;
    };

    /*──────────────────────── Step ────────────────────────*/
    class Step<I, O> {
        // @ts-expect-error its work
        public readonly id: string;
        // @ts-expect-error its work
        public readonly description: string;
        private readonly inputSchema?: ZodType<I>;
        private readonly outputSchema?: ZodType<O>;
        // @ts-expect-error its work
        private readonly maxAttempts: number;
        // @ts-expect-error its work
        private readonly retryDelayMs: number;
        // @ts-expect-error its work
        private readonly executor: (
            ctx: I,
            bag: Record<string, unknown>,
        ) => Promise<O> | O;

        constructor(cfg: {
            id: string;
            description?: string;
            inputSchema?: ZodType<I>;
            outputSchema?: ZodType<O>;
            maxAttempts?: number;
            retryDelayMs?: number;
            execute: (
                ctx: I,
                bag: Record<string, unknown>,
            ) => Promise<O> | O;
        }) {
            Object.assign(this, {
                id: cfg.id,
                description: cfg.description ?? "",
                inputSchema: cfg.inputSchema,
                outputSchema: cfg.outputSchema,
                maxAttempts: cfg.maxAttempts ?? 1,
                retryDelayMs: cfg.retryDelayMs ?? 0,
                executor: cfg.execute,
            });
        }

        async run(rawCtx: unknown, bag: Record<string, unknown>): Promise<O> {
            const ctx = this["inputSchema"]
                ? (this["inputSchema"] as ZodType<I>).parse(rawCtx)
                : (rawCtx as I);

            let err: unknown;
            for (let attempt = 1; attempt <= this["maxAttempts"]; attempt++) {
                try {
                    // deno-lint-ignore no-await-in-loop
                    const res = await this["executor"](ctx, bag);
                    return this["outputSchema"]
                        ? (this["outputSchema"] as ZodType<O>).parse(res)
                        : res;
                } catch (e) {
                    err = e;
                    if (attempt < this["maxAttempts"]) {
                        // deno-lint-ignore no-await-in-loop
                        await new Promise((r) => setTimeout(r, this["retryDelayMs"]));
                    }
                }
            }
            throw err;
        }
    }

    const Parallel = (
        ...steps: Step<any, any>[]
    ) => ({
        parallel: steps,
    }) as const;

    type ParallelDescriptor = ReturnType<typeof Parallel>;
    const isParallel = (v: unknown): v is ParallelDescriptor =>
        !!v && typeof v === "object" && "parallel" in (v as Record<string, unknown>);

    type Last<T extends readonly any[]> =
        number extends T["length"] ? never : T extends readonly [...any, infer L] ? L : never;

    type In<S> = S extends Step<infer I, any> ? I : never;
    type Out<S> = S extends Step<any, infer O> ? O : never;

    // — «узлы»
    type StepLike = Step<any, any> | ParallelDescriptor;

    type MergeInputs<T extends readonly StepLike[]> =
        T extends readonly [infer F extends StepLike, ...infer R extends StepLike[]]
            ? InNode<F> & MergeInputs<R>
            : unknown;

    type MergeOutputs<T extends readonly StepLike[]> =
        T extends readonly [infer F extends StepLike, ...infer R extends StepLike[]]
            ? OutNode<F> & MergeOutputs<R>
            : unknown;

    type InNode<N> =
        N extends Step<any, any> ? In<N>
            : N extends ParallelDescriptor ? MergeInputs<N["parallel"]>
                : never;

    type OutNode<N> =
        N extends Step<any, any> ? Out<N>
            : N extends ParallelDescriptor ? MergeOutputs<N["parallel"]>
                : never;

    type ValidateChain<L extends readonly StepLike[]> =
        L extends readonly [infer A extends StepLike, infer B extends StepLike, ...infer R extends StepLike[]]
            ? OutNode<A> extends InNode<B> ? ValidateChain<[B, ...R]> : never
            : L;

    type OutputOfSteps<S extends readonly StepLike[]> =
        [Last<S>] extends [never] ? unknown : OutNode<Last<S>>;

    const chain = <S extends readonly StepLike[]>(
        ...steps: ValidateChain<S> extends never ? never : S
    ): S => steps;

    type Bag = Record<string, unknown>;
    type InferTrigger<S> = S extends { parse(input: any): infer R } ? R : unknown;

    interface WorkflowConfig<
        TSchema extends { parse(input: any): any } | undefined,
        TSteps extends readonly StepLike[],
    > {
        name: string;
        steps: TSteps;
        triggerSchema?: TSchema;
    }

    class Workflow<
        TSchema extends { parse(input: any): any } | undefined = undefined,
        TSteps extends readonly StepLike[] = readonly StepLike[],
    > {
        private readonly name: string;
        private readonly steps: TSteps;
        private readonly triggerSchema?: TSchema;

        constructor(cfg: WorkflowConfig<TSchema, TSteps>) {
            if (cfg.name.includes(".")) {
                throw new Error("Workflow name must not contain dots ('.').");
            }
            this.name = cfg.name;
            this.steps = cfg.steps;
            this.triggerSchema = cfg.triggerSchema;

            const seen = new Set<string>();
            const walk = (s?: StepLike): void => {
                if (!s) return;
                if (isParallel(s)) {
                    s.parallel.forEach(walk);
                    return;
                }
                if (seen.has(s.id)) {
                    throw new Error(
                        `Duplicate step id detected in workflow '${this.name}': '${s.id}'`,
                    );
                }
                seen.add(s.id);
            };
            this.steps.forEach(walk);
        }

        public async run(
            rawTrigger: InferTrigger<TSchema>,
        ): Promise<OutputOfSteps<TSteps>> {
            const trigger = this.triggerSchema ? this.triggerSchema.parse(rawTrigger) : rawTrigger;
            const bag: Bag = {};
            let base: unknown = trigger;

            const exec = async (node: StepLike): Promise<void> => {
                if (isParallel(node)) {
                    const results = await Promise.all(
                        node.parallel.map(async (st) => {
                            const res = await st.run(base, bag);
                            Object.assign(bag, f_flatten(res, st.id), { [st.id]: res });
                            return res;
                        }),
                    );
                    base = results.reduce<Record<string, unknown>>((acc, cur) =>
                        f_isPlain(acc) && f_isPlain(cur) ? f_deepMerge(acc, cur) : acc, {});
                    return;
                }
                {
                    const st = node as Step<any, any>;
                    const res = await st.run(base, bag);
                    Object.assign(bag, f_flatten(res, st.id), { [st.id]: res });
                    base = res;
                }
            };

            for (const node of this.steps) await exec(node);
            return base as OutputOfSteps<TSteps>;
        }
    }

    const createWorkflow = <
        const Steps extends readonly StepLike[],
        S extends { parse(input: any): any } | undefined = undefined,
    >(
        cfg: WorkflowConfig<S, Steps>,
    ) => new Workflow<S, Steps>(cfg);

    return {
        Step,
        Workflow,
        Parallel,
        chain,
        createWorkflow,
    } as const;
})();

export const Step = __.Step;
export const Workflow = __.Workflow;
export const Parallel = __.Parallel;
export const chain = __.chain;
export const createWorkflow = __.createWorkflow;
