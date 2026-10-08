import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod/v4";

/**
 * The shared AI client against a fake SDK: one `beta.messages.stream` whose
 * `finalMessage()` hands back the next scripted reply or throws the next
 * scripted error. Nothing here reaches the network.
 */
const h = vi.hoisted(() => {
  type Reply = {
    stop_reason: string;
    content: Array<{ type: string; text?: string; thinking?: string; signature?: string }>;
    usage?: Record<string, number | null>;
    model?: string;
  };
  const state = {
    script: [] as Array<{ reply?: Reply; error?: Error }>,
    calls: [] as Array<Record<string, any>>,
    options: [] as Array<Record<string, any> | undefined>,
    audits: [] as Array<Record<string, any>>,
    config: null as unknown,
  };
  const stream = (params: Record<string, any>, options?: Record<string, any>) => {
    state.calls.push(params);
    state.options.push(options);
    return {
      finalMessage: async () => {
        const next = state.script.shift();
        if (!next) throw new Error("no scripted reply left");
        if (next.error) throw next.error;
        return {
          id: "msg_1",
          role: "assistant",
          type: "message",
          model: next.reply!.model ?? "claude-opus-5-5",
          stop_reason: next.reply!.stop_reason,
          content: next.reply!.content,
          usage: next.reply!.usage ?? {
            input_tokens: 100,
            output_tokens: 20,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 0,
          },
        };
      },
    };
  };
  class FakeAnthropic {
    beta = { messages: { stream } };
    constructor(public options: Record<string, unknown>) {}
  }
  class FakeApiError extends Error {
    constructor(
      public status: number,
      message: string,
      public error = { error: { message } },
    ) {
      super(`${status} ${message}`);
    }
  }
  return { state, FakeAnthropic, FakeApiError };
});

vi.mock("@anthropic-ai/sdk", () => ({ default: h.FakeAnthropic }));
vi.mock("../server/audit", () => ({
  audit: async (entry: Record<string, any>) => {
    h.state.audits.push(entry);
  },
}));
vi.mock("../server/app-config", () => ({
  getConfigValue: async () => h.state.config,
  CONFIG_DEFAULTS: { "ai.effort": "high" },
}));

import {
  AiParseError,
  AiRefusedError,
  AiTruncatedError,
  describeAiError,
  resetAnthropicClient,
  runStructured,
} from "../server/ai/client";

const schema = z.object({ name: z.string(), seats: z.number().nullable() });
const good = { name: "Summit", seats: 140 };

function text(t: string) {
  return { type: "text", text: t };
}

function run(overrides: Partial<Parameters<typeof runStructured>[0]> = {}) {
  return runStructured({
    kind: "sow_plan",
    schema,
    system: "Read the SOW.",
    content: "The document.",
    maxTokens: 1000,
    dealId: "11111111-1111-4111-8111-111111111111",
    ...overrides,
  });
}

beforeEach(() => {
  h.state.script = [];
  h.state.calls = [];
  h.state.options = [];
  h.state.audits = [];
  h.state.config = null;
  resetAnthropicClient();
  delete process.env["ANTHROPIC_MODEL"];
});

describe("runStructured", () => {
  it("sends the grammar, the effort, adaptive thinking and the fallbacks, and returns data with usage", async () => {
    h.state.script.push({
      reply: {
        stop_reason: "end_turn",
        content: [
          { type: "thinking", thinking: "…", signature: "sig" },
          text(JSON.stringify(good)),
        ],
        usage: {
          input_tokens: 1200,
          output_tokens: 80,
          cache_read_input_tokens: 1000,
          cache_creation_input_tokens: 0,
        },
      },
    });
    const r = await run();
    expect(r.data).toEqual(good);
    expect(r.attempts).toBe(1);
    expect(r.usage).toEqual({
      input_tokens: 1200,
      output_tokens: 80,
      cache_read_input_tokens: 1000,
      cache_creation_input_tokens: 0,
    });
    expect(r.model).toBe("claude-opus-5-5");

    const params = h.state.calls[0]!;
    expect(params["model"]).toBe("claude-opus-5-5");
    expect(params["thinking"]).toEqual({ type: "adaptive" });
    expect(params["max_tokens"]).toBe(1000);
    expect(params["output_config"]["effort"]).toBe("high");
    expect(params["output_config"]["format"]["type"]).toBe("json_schema");
    expect(params["output_config"]["format"]["schema"]["properties"]["name"]).toBeTruthy();
    expect(params["output_config"]["format"]["parse"]).toBeUndefined();
    expect(params["fallbacks"]).toBe("default");
    expect(params["betas"]).toEqual(["server-side-fallback-2026-07-01"]);
    expect(params["system"]).toEqual([{ type: "text", text: "Read the SOW." }]);
    // The whole stream is bounded, not just the wait for headers.
    expect(h.state.options[0]?.["signal"]).toBeInstanceOf(AbortSignal);

    // The spend is attributable.
    const row = h.state.audits[0]!;
    expect(row["action"]).toBe("ai.call");
    expect(row["actor_type"]).toBe("system");
    expect(row["entity_id"]).toBe("11111111-1111-4111-8111-111111111111");
    expect(row["payload"]["kind"]).toBe("sow_plan");
    expect(row["payload"]["usage"]["input_tokens"]).toBe(1200);
  });

  it("reads the effort and the model from config and env", async () => {
    h.state.config = { default: "medium", sow_plan: "xhigh" };
    process.env["ANTHROPIC_MODEL"] = "claude-test-1";
    h.state.script.push({
      reply: { stop_reason: "end_turn", content: [text(JSON.stringify(good))] },
    });
    await run();
    expect(h.state.calls[0]!["output_config"]["effort"]).toBe("xhigh");
    expect(h.state.calls[0]!["model"]).toBe("claude-test-1");
  });

  it("repairs once: the reply goes back as an assistant turn with what was wrong", async () => {
    const bad = [text(JSON.stringify({ name: 5, seats: "many" }))];
    h.state.script.push(
      { reply: { stop_reason: "end_turn", content: bad } },
      { reply: { stop_reason: "end_turn", content: [text(JSON.stringify(good))] } },
    );
    const r = await run();
    expect(r.data).toEqual(good);
    expect(r.attempts).toBe(2);
    expect(r.usage.input_tokens).toBe(200);
    const second = h.state.calls[1]!["messages"];
    expect(second).toHaveLength(3);
    expect(second[1]).toEqual({ role: "assistant", content: bad });
    expect(second[2]["role"]).toBe("user");
    expect(second[2]["content"]).toMatch(/name/);
    expect(second[2]["content"]).toMatch(/seats/);
  });

  it("gives up after the repair turn with the issues named", async () => {
    const bad = [text(JSON.stringify({ name: 5 }))];
    h.state.script.push(
      { reply: { stop_reason: "end_turn", content: bad } },
      { reply: { stop_reason: "end_turn", content: bad } },
    );
    await expect(run()).rejects.toBeInstanceOf(AiParseError);
    expect(h.state.audits).toHaveLength(1);
  });

  it("falls back to JSON in prose when the grammar does not compile", async () => {
    h.state.script.push(
      { error: new h.FakeApiError(400, "The compiled grammar is too large") },
      {
        reply: {
          stop_reason: "end_turn",
          content: [text("Here you go:\n```json\n" + JSON.stringify(good) + "\n```\nDone.")],
        },
      },
    );
    const r = await run();
    expect(r.data).toEqual(good);
    expect(r.attempts).toBe(2);
    const retry = h.state.calls[1]!;
    expect(retry["output_config"]["format"]).toBeUndefined();
    expect(retry["output_config"]["effort"]).toBe("high");
    const system = retry["system"] as Array<{ text: string }>;
    expect(system[0]!.text).toBe("Read the SOW.");
    expect(system[system.length - 1]!.text).toMatch(/JSON Schema/);
    expect(system[system.length - 1]!.text).toMatch(/"seats"/);
  });

  it("refuses the text fallback when the caller turned it off", async () => {
    h.state.script.push({ error: new h.FakeApiError(400, "The compiled grammar is too large") });
    await expect(run({ fallbackToText: false })).rejects.toThrow(/grammar/);
  });

  it("retries without fallbacks when the beta is refused", async () => {
    h.state.script.push(
      { error: new h.FakeApiError(400, "fallbacks: this beta is not enabled for this key") },
      { reply: { stop_reason: "end_turn", content: [text(JSON.stringify(good))] } },
    );
    const r = await run();
    expect(r.data).toEqual(good);
    const retry = h.state.calls[1]!;
    expect(retry["fallbacks"]).toBeUndefined();
    expect(retry["betas"]).toBeUndefined();
    expect(retry["output_config"]["format"]).toBeTruthy();
  });

  it("throws any other 400 as it is", async () => {
    h.state.script.push({ error: new h.FakeApiError(400, "max_tokens: must be at least 1") });
    await expect(run()).rejects.toThrow(/max_tokens/);
    expect(h.state.calls).toHaveLength(1);
  });

  it("does not mistake an effort or budget 400 for a grammar failure", async () => {
    h.state.script.push({
      error: new h.FakeApiError(400, "output_config.effort: 'xhigh' is not supported"),
    });
    await expect(run()).rejects.toThrow(/effort/);
    expect(h.state.calls).toHaveLength(1);
    expect(h.state.calls[0]!["output_config"]["format"]).toBeTruthy();

    h.state.script.push({
      error: new h.FakeApiError(400, "output_config.task_budget.total: must be at least 20000"),
    });
    await expect(run()).rejects.toThrow(/task_budget/);
    expect(h.state.calls).toHaveLength(2);
  });

  it("maps a refusal to AiRefusedError and still records the spend", async () => {
    h.state.script.push({ reply: { stop_reason: "refusal", content: [] } });
    await expect(run()).rejects.toBeInstanceOf(AiRefusedError);
    expect(h.state.audits[0]!["payload"]["usage"]["input_tokens"]).toBe(100);
  });

  it("maps max_tokens to AiTruncatedError", async () => {
    h.state.script.push({ reply: { stop_reason: "max_tokens", content: [text('{"name":"Su')] } });
    const e = await run().catch((err) => err);
    expect(e).toBeInstanceOf(AiTruncatedError);
    expect((e as AiTruncatedError).maxTokens).toBe(1000);
  });

  it("caches a long system prompt for an hour unless the caller placed a breakpoint", async () => {
    const long = "x".repeat(3500);
    h.state.script.push(
      { reply: { stop_reason: "end_turn", content: [text(JSON.stringify(good))] } },
      { reply: { stop_reason: "end_turn", content: [text(JSON.stringify(good))] } },
      { reply: { stop_reason: "end_turn", content: [text(JSON.stringify(good))] } },
    );
    await run({
      system: [
        { type: "text", text: "stable" },
        { type: "text", text: long },
      ],
    });
    const blocks = h.state.calls[0]!["system"];
    expect(blocks[0]["cache_control"]).toBeUndefined();
    expect(blocks[1]["cache_control"]).toEqual({ type: "ephemeral", ttl: "1h" });

    await run({ system: "short" });
    expect(h.state.calls[1]!["system"][0]["cache_control"]).toBeUndefined();

    await run({
      system: [{ type: "text", text: long, cache_control: { type: "ephemeral" } }],
    });
    expect(h.state.calls[2]!["system"][0]["cache_control"]).toEqual({ type: "ephemeral" });
  });

  it("builds the client once with the timeout and one retry", async () => {
    h.state.script.push(
      { reply: { stop_reason: "end_turn", content: [text(JSON.stringify(good))] } },
      { reply: { stop_reason: "end_turn", content: [text(JSON.stringify(good))] } },
    );
    await run();
    await run();
    const { getAnthropic } = await import("../server/ai/client");
    const client = (await getAnthropic()) as unknown as { options: Record<string, unknown> };
    expect(client.options).toEqual({ timeout: 240_000, maxRetries: 1 });
  });
});

describe("describeAiError", () => {
  it("names the real problem in one line", () => {
    expect(describeAiError(new h.FakeApiError(401, "invalid x-api-key"))).toMatch(
      /ANTHROPIC_API_KEY/,
    );
    expect(describeAiError(new h.FakeApiError(429, "slow down"))).toMatch(/rate limited/);
    expect(describeAiError(new h.FakeApiError(400, "bad thing"), "Reading the SOW")).toBe(
      "Reading the SOW failed: the request was rejected (bad thing).",
    );
    expect(describeAiError(new h.FakeApiError(529, "overloaded"))).toMatch(/529/);
    expect(describeAiError(new AiRefusedError("brief"))).toMatch(/declined/);
    // The stream timer firing surfaces as the SDK's abort error, status-less.
    const aborted = new Error("Request was aborted.");
    aborted.name = "APIUserAbortError";
    expect(describeAiError(aborted)).toMatch(/within 240 seconds/);
    expect(describeAiError(new Error("plain"))).toBe("plain");
    expect(describeAiError("?")).toBe("AI synthesis failed.");
  });
});
