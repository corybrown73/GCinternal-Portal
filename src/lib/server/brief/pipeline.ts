import type { BetaContentBlockParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";

import type { SowReading } from "../../sow-plan";
import { runStructured, type AiUsage } from "../ai/client";
import { aiEffort, type AiEffort } from "../ai/config";
import type { PreparedDocument } from "../ai/documents";
import type { DealSources } from "../ai/sources";
import {
  assembleBrief,
  briefCoreSchema,
  briefPlanSchema,
  type BriefCore,
  type BriefJson,
  type BriefPlan,
} from "../schemas";
import { BRIEF_SYSTEM_PROMPT } from "./prompt";
import { verifyBrief } from "./verify";

/**
 * The brief in three passes over one cached prefix: the core (who they
 * are, how they work, what they want), the plan against it (the deck, the
 * expansion, the intake, the welcome page), and the check of both against
 * the sources. The background job runs them as three steps; a person's
 * "Generate brief" runs them in a row. Both go through here, so the
 * prompts, the schemas and the prefix are decided once.
 */

export type BriefContext = {
  dealId: string;
  sources: DealSources;
  /** The kept SOW reading, when one exists: the brief agrees with it rather than reading the SOW a third way. */
  sowReading: SowReading | null;
  /** Every pass sends exactly this first; the cache marker is on its last block. */
  prefix: BetaContentBlockParam[];
  /** One system prompt for all three passes, so the cache prefix holds across them. */
  system: string;
  /**
   * One effort for all three passes, decided here under the `brief` kind:
   * the cached prefix is keyed on the request's parameters too, so a
   * per-kind effort would have each pass paying for the prefix again.
   */
  effort: AiEffort;
  jobId?: string | null | undefined;
};

/** The sources loaded and the prefix built once; the passes share it. */
export async function buildBriefContext(
  dealId: string,
  opts: { sources?: DealSources | undefined; jobId?: string | null | undefined } = {},
): Promise<BriefContext> {
  const { loadDealSources, sharedPrefix } = await import("../ai/sources");
  const sources = opts.sources ?? (await loadDealSources(dealId));
  // The reading of the document the sow step read — the SOW, else the
  // contract on a seats-only deal — and only of those bytes: an older
  // document's reading would have the brief agree with a SOW that is no
  // longer on file.
  const doc = sources.sow?.block ? sources.sow : sources.contract?.block ? sources.contract : null;
  const { loadSowReading } = await import("../ai/readings");
  const kept = doc ? await loadSowReading(dealId, { sha256: doc.sha256 }) : null;
  const sowReading =
    doc && kept && kept.source_hash === doc.sha256 && kept.reading.readable ? kept.reading : null;
  return {
    dealId,
    sources,
    sowReading,
    prefix: sharedPrefix(sources, { sowReading }),
    system: BRIEF_SYSTEM_PROMPT,
    effort: await aiEffort("brief"),
    jobId: opts.jobId ?? null,
  };
}

/** What the brief can read from: calls, reviewed notes, or the record's summary. */
export function briefHasSources(ctx: Pick<BriefContext, "sources">): boolean {
  const s = ctx.sources;
  return s.reports.length > 0 || s.notes.length > 0 || Boolean(s.account.summary?.trim());
}

export async function runBriefCore(
  ctx: BriefContext,
): Promise<{ core: BriefCore; usage: AiUsage }> {
  const { BRIEF_CORE_TASK } = await import("./prompt");
  const result = await runStructured({
    kind: "brief_core",
    schema: briefCoreSchema,
    system: ctx.system,
    content: [...ctx.prefix, { type: "text", text: BRIEF_CORE_TASK }],
    // The grammar for the whole brief was too large once; each half is
    // smaller, and the text path stands behind it either way.
    fallbackToText: true,
    maxTokens: 32000,
    effort: ctx.effort,
    dealId: ctx.dealId,
    jobId: ctx.jobId ?? null,
  });
  return { core: result.data, usage: result.usage };
}

export async function runBriefPlan(
  ctx: BriefContext,
  core: BriefCore,
): Promise<{ plan: BriefPlan; usage: AiUsage }> {
  const { briefPlanTask } = await import("./prompt");
  const result = await runStructured({
    kind: "brief_plan",
    schema: briefPlanSchema,
    system: ctx.system,
    content: [...ctx.prefix, { type: "text", text: briefPlanTask(JSON.stringify(core)) }],
    fallbackToText: true,
    maxTokens: 32000,
    effort: ctx.effort,
    dealId: ctx.dealId,
    jobId: ctx.jobId ?? null,
  });
  const plan = result.data;
  return {
    plan: {
      ...plan,
      welcome: { ...plan.welcome, focus_items: plan.welcome.focus_items.slice(0, 8) },
    },
    usage: result.usage,
  };
}

export async function runBriefVerify(
  ctx: BriefContext,
  brief: BriefJson,
  now?: () => Date,
): Promise<{ brief: BriefJson; usage: AiUsage | null }> {
  return verifyBrief(
    {
      dealId: ctx.dealId,
      prefix: ctx.prefix,
      system: ctx.system,
      effort: ctx.effort,
      callsText: ctx.sources.callsText,
      sow: readableSow(ctx),
      jobId: ctx.jobId ?? null,
    },
    brief,
    now,
  );
}

/** The SOW when it was read, for the verifier's text check; null when it could not be. */
export function readableSow(ctx: Pick<BriefContext, "sources">): PreparedDocument | null {
  const sow = ctx.sources.sow;
  return sow && !sow.problem ? sow : null;
}

/** The three passes in a row: a person's brief, or a test of the whole. */
export async function runBriefPipeline(
  ctx: BriefContext,
): Promise<{ brief: BriefJson; usage: AiUsage }> {
  const { core, usage: u1 } = await runBriefCore(ctx);
  const { plan, usage: u2 } = await runBriefPlan(ctx, core);
  const { brief, usage: u3 } = await runBriefVerify(ctx, assembleBrief(core, plan));
  return { brief, usage: sumUsage([u1, u2, u3]) };
}

export function sumUsage(parts: Array<AiUsage | null | undefined>): AiUsage {
  const total: AiUsage = {
    input_tokens: 0,
    output_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
  };
  for (const u of parts) {
    if (!u) continue;
    total.input_tokens += u.input_tokens;
    total.output_tokens += u.output_tokens;
    total.cache_read_input_tokens += u.cache_read_input_tokens;
    total.cache_creation_input_tokens += u.cache_creation_input_tokens;
  }
  return total;
}
