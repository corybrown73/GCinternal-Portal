import type Anthropic from "@anthropic-ai/sdk";
import type {
  BetaContentBlockParam,
  BetaMessage,
  BetaMessageParam,
  BetaMessageStreamParams,
  BetaTextBlockParam,
  BetaUsage,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { z as z4 } from "zod/v4";

import { audit } from "../audit";
import {
  AI_CALL_TIMEOUT_MS,
  AI_STEP_BUDGET_MS,
  aiEffort,
  aiModel,
  type AiCallKind,
  type AiEffort,
} from "./config";
import { extractJsonObject } from "./json";

/**
 * One client, one way to ask the model for a JSON object that matches a zod
 * schema. Every reader in the app goes through `runStructured`; none builds
 * its own request, so the model, the effort, the caching, the fallbacks and
 * the usage record are decided once, here.
 *
 * Streaming always: a non-streaming request refuses a `max_tokens` the SDK
 * thinks could outlast its timeout, and every reading here is large.
 */

export type { BetaContentBlockParam as AiContentBlock, BetaTextBlockParam as AiTextBlock };

/** The beta header for server-side fallbacks, sent with `fallbacks: "default"`. */
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

/**
 * A system prompt longer than this gets a cache breakpoint on its own: the
 * same reader sends the same prompt for every deal, so the entry is read
 * for an hour. The API caches nothing under 512 tokens (claude-opus-5-5),
 * so the bar sits comfortably above that. The document and the calls live
 * in `messages`, after this breakpoint, and are NOT cached here: one
 * reading alone would write an entry nobody reads back, and two passes
 * with different output schemas cannot share one either — the output
 * format is part of the cached prefix. This module leaves a caller's own
 * markers alone.
 */
const CACHE_SYSTEM_CHARS = 3000;

/**
 * A model call that cannot have this long is not started: a repair turn
 * cut off by the function ceiling spends its tokens and keeps nothing.
 */
const MIN_CALL_MS = 20_000;

/** A 400 about the output grammar, as distinct from one about the effort or a budget. */
function isGrammarRejection(message: string): boolean {
  return (
    /grammar|output_format|output_config\.format|json_schema|schema/i.test(message) &&
    !/effort|task_budget/i.test(message)
  );
}

/** The wording the text path adds when the grammar is too large to compile. */
const TEXT_OUTPUT_RULES =
  "Output: reply with exactly one JSON object and nothing else — no preamble, no code fence. It must match this JSON Schema (every listed property present; use null or [] where the sources do not say):";

export type AiUsage = {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
};

export type RunStructuredArgs<T> = {
  kind: AiCallKind;
  /** A zod/v4 schema: it becomes the output grammar and validates the reply. */
  schema: z4.ZodType<T>;
  /** Stable text first; a caller may set `cache_control` on the last stable block. */
  system: string | BetaTextBlockParam[];
  content: string | BetaContentBlockParam[];
  maxTokens: number;
  /** Overrides the configured `ai.effort` for this call. */
  effort?: AiEffort | undefined;
  /**
   * When the API cannot compile the schema into a grammar, ask for JSON in
   * prose with the schema in the system prompt instead. On by default:
   * a reading that works is better than a 400.
   */
  fallbackToText?: boolean | undefined;
  /** Whose spend this is, for the usage row. */
  dealId?: string | null | undefined;
  jobId?: string | null | undefined;
  model?: string | undefined;
};

export type RunStructuredResult<T> = {
  data: T;
  usage: AiUsage;
  model: string;
  stop_reason: string | null;
  /** Model calls made, repair turn and 400 retries included. */
  attempts: number;
  ms: number;
};

/** The model declined the content for policy reasons. */
export class AiRefusedError extends Error {
  constructor(public readonly kind: AiCallKind) {
    super("The model declined to read this content.");
    this.name = "AiRefusedError";
  }
}

/** The reply hit `max_tokens` before the object closed. */
export class AiTruncatedError extends Error {
  constructor(
    public readonly kind: AiCallKind,
    public readonly maxTokens: number,
  ) {
    super(`The reply ran past ${maxTokens} tokens before it finished.`);
    this.name = "AiTruncatedError";
  }
}

/** Two replies in a row did not match the schema. */
export class AiParseError extends Error {
  constructor(
    public readonly kind: AiCallKind,
    public readonly issues: string,
  ) {
    super(`The reply did not match the expected shape: ${issues}`);
    this.name = "AiParseError";
  }
}

/** The step's time ran out before another model call could start. */
export class AiBudgetError extends Error {
  constructor(
    public readonly kind: AiCallKind,
    public readonly after: string,
  ) {
    super(
      `No time left in this step for another model call${after ? ` after: ${after}` : ""}. Try again.`,
    );
    this.name = "AiBudgetError";
  }
}

let client: Anthropic | null = null;

/**
 * The SDK is ~578 kB; it is loaded on the first call, not at module scope,
 * so a request that never reads anything does not parse it. Shared across
 * calls on the same instance.
 */
export async function getAnthropic(): Promise<Anthropic> {
  if (client) return client;
  const { default: AnthropicSDK } = await import("@anthropic-ai/sdk");
  client = new AnthropicSDK({ timeout: AI_CALL_TIMEOUT_MS, maxRetries: 1 });
  return client;
}

/** Test seam. */
export function resetAnthropicClient(): void {
  client = null;
}

export async function runStructured<T>(
  args: RunStructuredArgs<T>,
): Promise<RunStructuredResult<T>> {
  const startedAt = Date.now();
  const anthropic = await getAnthropic();
  const model = args.model ?? aiModel();
  const effort = args.effort ?? (await aiEffort(args.kind));
  const fallbackToText = args.fallbackToText ?? true;
  const usage = emptyUsage();
  let attempts = 0;
  let servedBy = model;

  // The grammar is built once; the API compiles it per request.
  const { zodOutputFormat } = await import("@anthropic-ai/sdk/helpers/zod");
  // Only the schema goes on the wire. The helper's `parse` would make the
  // stream itself throw on a zod miss, before the repair turn can run.
  const format = { type: "json_schema" as const, schema: zodOutputFormat(args.schema).schema };

  let system = withCacheBreakpoint(normalizeSystem(args.system));
  let useFormat = true;
  let useFallbacks = true;
  let useTtl = true;
  let lastIssues = "";
  // One deadline for everything this call may spend: the reply, the repair
  // turn and the 400 retries share it, so a step never outlives the
  // function it runs in.
  const deadline = startedAt + AI_STEP_BUDGET_MS;

  const call = async (messages: BetaMessageParam[]): Promise<BetaMessage> => {
    const remaining = deadline - Date.now();
    if (remaining < MIN_CALL_MS) throw new AiBudgetError(args.kind, lastIssues);
    const params: BetaMessageStreamParams = {
      model,
      max_tokens: args.maxTokens,
      thinking: { type: "adaptive" },
      output_config: { effort, ...(useFormat ? { format } : {}) },
      system: useTtl ? system : withoutTtl(system),
      messages: useTtl ? messages : messages.map(withoutTtlInContent),
      ...(useFallbacks ? { betas: [FALLBACK_BETA], fallbacks: "default" as const } : {}),
    };
    attempts += 1;
    // The client's `timeout` only covers the wait for response headers;
    // the signal bounds the whole stream, body included, and the SDK's
    // one connection retry runs inside the same window.
    const stream = anthropic.beta.messages.stream(params, {
      signal: AbortSignal.timeout(Math.min(AI_CALL_TIMEOUT_MS, remaining)),
    });
    try {
      return await stream.finalMessage();
    } catch (e) {
      if (!isBadRequest(e)) {
        // An attempt the timer cut off, or one that broke mid-stream, was
        // billed for what streamed: the SDK keeps that partial message, so
        // the usage row carries it. (Nothing arrived yet → nothing known.)
        addUsage(usage, stream.currentMessage?.usage);
        throw e;
      }
      const message = apiMessage(e);
      // The grammar did not compile (too large, an unsupported keyword):
      // ask for JSON in prose with the schema in the prompt instead.
      if (useFormat && isGrammarRejection(message)) {
        if (!fallbackToText) throw e;
        useFormat = false;
        system = withSchemaText(system, format.schema);
        return call(messages);
      }
      // Server-side fallbacks are a beta: when this key or model cannot use
      // them, the reading matters more than the safety net.
      if (useFallbacks && /fallback|beta/i.test(message)) {
        useFallbacks = false;
        return call(messages);
      }
      // The one-hour cache TTL is the only cache setting this module adds.
      if (useTtl && /ttl|cache_control/i.test(message)) {
        useTtl = false;
        return call(messages);
      }
      throw e;
    }
  };

  const messages: BetaMessageParam[] = [{ role: "user", content: args.content }];
  try {
    for (let turn = 0; turn < 2; turn++) {
      const reply = await call(messages);
      addUsage(usage, reply.usage);
      servedBy = reply.model || model;
      if (reply.stop_reason === "refusal") throw new AiRefusedError(args.kind);
      if (reply.stop_reason === "max_tokens") throw new AiTruncatedError(args.kind, args.maxTokens);

      const text = reply.content
        .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
        .map((b) => b.text)
        .join("\n");
      const parsed = parseReply(text, args.schema, !useFormat);
      if (parsed.ok) {
        return {
          data: parsed.data,
          usage,
          model: servedBy,
          stop_reason: reply.stop_reason,
          attempts,
          ms: Date.now() - startedAt,
        };
      }
      lastIssues = parsed.error;
      // One repair turn: the reply goes back as a normal assistant turn
      // (thinking blocks included, so their signatures hold) and a user
      // message says what was wrong. Never a prefill.
      messages.push(
        { role: "assistant", content: reply.content as BetaContentBlockParam[] },
        {
          role: "user",
          content: `That reply could not be used: ${parsed.error}. Reply again with exactly one JSON object matching the schema, and nothing else.`,
        },
      );
    }
    throw new AiParseError(args.kind, lastIssues);
  } finally {
    if (attempts > 0) {
      await recordAiUsage({
        kind: args.kind,
        dealId: args.dealId ?? null,
        jobId: args.jobId ?? null,
        model: servedBy,
        usage,
        ms: Date.now() - startedAt,
        attempts,
      });
    }
  }
}

type Parsed<T> = { ok: true; data: T } | { ok: false; error: string };

function parseReply<T>(text: string, schema: z4.ZodType<T>, lenient: boolean): Parsed<T> {
  // With a grammar the whole text is the object; in prose it may sit in a
  // fence or after a sentence.
  const raw = lenient ? extractJsonObject(text) : text.trim() || null;
  if (!raw) return { ok: false, error: "The reply held no JSON object" };
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch (e) {
    // A grammar-bound reply that still fails to parse is worth one lenient look.
    const retry = lenient ? null : extractJsonObject(text);
    if (retry && retry !== raw) {
      try {
        value = JSON.parse(retry);
      } catch {
        return { ok: false, error: `Invalid JSON: ${e instanceof Error ? e.message : String(e)}` };
      }
    } else {
      return { ok: false, error: `Invalid JSON: ${e instanceof Error ? e.message : String(e)}` };
    }
  }
  const checked = schema.safeParse(value);
  if (checked.success) return { ok: true, data: checked.data };
  const issues = checked.error.issues
    .slice(0, 12)
    .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("; ");
  return { ok: false, error: `Did not match the expected shape — ${issues}` };
}

function normalizeSystem(system: string | BetaTextBlockParam[]): BetaTextBlockParam[] {
  return typeof system === "string"
    ? [{ type: "text", text: system }]
    : system.map((b) => ({ ...b }));
}

/**
 * A long system prompt is the same on every call for that reader, so it
 * is cached for an hour unless the caller placed its own breakpoint.
 */
function withCacheBreakpoint(system: BetaTextBlockParam[]): BetaTextBlockParam[] {
  const last = system[system.length - 1];
  if (!last || system.some((b) => b.cache_control)) return system;
  const chars = system.reduce((n, b) => n + b.text.length, 0);
  if (chars <= CACHE_SYSTEM_CHARS) return system;
  return [...system.slice(0, -1), { ...last, cache_control: { type: "ephemeral", ttl: "1h" } }];
}

function withSchemaText(
  system: BetaTextBlockParam[],
  schema: Record<string, unknown>,
): BetaTextBlockParam[] {
  // Appended as its own block, after the cached prefix, so the cache for
  // the structured form is not invalidated by the fallback.
  return [...system, { type: "text", text: `\n\n${TEXT_OUTPUT_RULES}\n${JSON.stringify(schema)}` }];
}

function withoutTtl(system: BetaTextBlockParam[]): BetaTextBlockParam[] {
  return system.map((b) =>
    b.cache_control?.ttl ? { ...b, cache_control: { type: "ephemeral" } } : b,
  );
}

function withoutTtlInContent(m: BetaMessageParam): BetaMessageParam {
  if (typeof m.content === "string") return m;
  return {
    ...m,
    content: m.content.map((b) =>
      "cache_control" in b && b.cache_control?.ttl
        ? ({ ...b, cache_control: { type: "ephemeral" } } as BetaContentBlockParam)
        : b,
    ),
  };
}

function emptyUsage(): AiUsage {
  return {
    input_tokens: 0,
    output_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
  };
}

function addUsage(total: AiUsage, u: BetaUsage | null | undefined): void {
  if (!u) return;
  total.input_tokens += u.input_tokens ?? 0;
  total.output_tokens += u.output_tokens ?? 0;
  total.cache_read_input_tokens += u.cache_read_input_tokens ?? 0;
  total.cache_creation_input_tokens += u.cache_creation_input_tokens ?? 0;
}

/* ----------------------------------------------------------- errors */

type ApiErrorLike = Error & {
  status?: number | undefined;
  error?: { error?: { message?: string } } | undefined;
};

/** Duck-typed on the SDK's APIError shape so no runtime import of the SDK is needed here. */
function isApiError(e: unknown): e is ApiErrorLike {
  return e instanceof Error && typeof (e as ApiErrorLike).status === "number";
}

function isBadRequest(e: unknown): e is ApiErrorLike {
  return isApiError(e) && e.status === 400;
}

function apiMessage(e: ApiErrorLike): string {
  return e.error?.error?.message ?? e.message;
}

/**
 * One line a person can act on, in place of the SDK's raw "400 {json}".
 * Most specific first; the message of an API error is kept because it
 * names the actual problem. `what` names the reading that failed.
 */
export function describeAiError(e: unknown, what = "AI synthesis"): string {
  if (
    e instanceof AiRefusedError ||
    e instanceof AiTruncatedError ||
    e instanceof AiParseError ||
    e instanceof AiBudgetError
  ) {
    return `${what} failed: ${e.message}`;
  }
  if (isApiError(e)) {
    if (e.status === 401)
      return `${what} failed: the API key was rejected. Check ANTHROPIC_API_KEY on the deployment.`;
    if (e.status === 429) return `${what} failed: rate limited. Try again in a minute.`;
    if (e.status === 400) return `${what} failed: the request was rejected (${apiMessage(e)}).`;
    return `${what} failed (${e.status ?? "network"}): ${apiMessage(e)}`;
  }
  // The SDK reports an expired signal as APIUserAbortError ("Request was
  // aborted"), with no status; the only signal this module passes is the timer.
  if (
    e instanceof Error &&
    (e.name === "APIUserAbortError" || /timed? ?out|timeout|aborted/i.test(e.message))
  ) {
    return `${what} failed: the model did not answer within ${Math.round(AI_CALL_TIMEOUT_MS / 1000)} seconds. Try again.`;
  }
  return e instanceof Error ? e.message : `${what} failed.`;
}

/* ------------------------------------------------------------ usage */

export type AiUsageRecord = {
  kind: AiCallKind;
  dealId?: string | null | undefined;
  jobId?: string | null | undefined;
  model: string;
  usage: AiUsage;
  ms: number;
  attempts?: number | undefined;
};

/**
 * Every call leaves an `ai.call` audit row, so spend is attributable to a
 * deal and a job and the admin page can total it. Never throws: the
 * reading is the point, and the audit module already alerts on its own
 * failure.
 */
export async function recordAiUsage(r: AiUsageRecord): Promise<void> {
  try {
    await audit({
      actor_type: "system",
      action: "ai.call",
      entity_type: r.dealId ? "account" : "ai",
      ...(r.dealId ? { entity_id: r.dealId } : {}),
      payload: {
        kind: r.kind,
        deal_id: r.dealId ?? null,
        job_id: r.jobId ?? null,
        model: r.model,
        usage: r.usage,
        ms: r.ms,
        ...(r.attempts !== undefined ? { attempts: r.attempts } : {}),
      },
    });
  } catch (e) {
    console.error("[ai] could not record the call's usage", e);
  }
}
