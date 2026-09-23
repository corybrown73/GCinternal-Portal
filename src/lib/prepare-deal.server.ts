import { supabaseAdmin } from "@/integrations/supabase/client.server";

import { readIntake } from "./intake-answers";
import { readingInFlight } from "./stage-flow";
import { mergeIntake } from "./server/intake-merge";

const db = () => supabaseAdmin as any;

/**
 * Prepare the deal from its sources, with nobody pressing anything.
 *
 * Runs when the Gong brief or the SOW arrives (and when somebody asks to
 * read again). Two readings at once — the brief (calls + SOW, checked, then
 * filled into the intake, then the help articles) and the SOW reader —
 * then the SOW's services go on the plan and the customer's link is made.
 * Every write is a merge, so a person typing meanwhile loses nothing.
 *
 * One at a time per deal: a second call while one is running asks for one
 * more run afterwards (`again`) instead of racing it.
 */
export async function prepareDeal(
  userId: string,
  dealId: string,
): Promise<{ status: "done" | "failed" | "queued"; filled: string[]; error: string | null }> {
  const { requireSalesEditor } = await import("./presale.server");
  await requireSalesEditor(userId);

  const { data: before } = await db()
    .from("portal_accounts")
    .select("intake,sow_document_path,welcome_share_url")
    .eq("id", dealId)
    .maybeSingle();
  if (!before) throw new Error("Deal not found");
  const current = readIntake(before.intake);
  if (readingInFlight(current.ai_reading)) {
    await mergeIntake(dealId, { ai_reading: { ...current.ai_reading!, again: true } });
    return { status: "queued", filled: [], error: null };
  }
  const startedAt = new Date().toISOString();
  await mergeIntake(dealId, {
    ai_reading: {
      status: "running",
      started_at: startedAt,
      finished_at: null,
      filled: [],
      error: null,
      again: false,
    },
  });

  const filled: string[] = [];
  const problems: string[] = [];
  try {
    const { generateDealBrief } = await import("./presale.server");
    const { proposePlanFromSow } = await import("./sow-plan.server");
    // No notes yet (the SOW came first): read the SOW now, the calls when
    // they arrive — their upload starts another reading.
    const { count: notes } = await db()
      .from("portal_gong_reports")
      .select("id", { count: "exact", head: true })
      .eq("account_id", dealId);
    const [brief, sow] = await Promise.allSettled([
      (notes ?? 0) > 0 ? generateDealBrief(userId, dealId) : Promise.resolve(null),
      before.sow_document_path ? proposePlanFromSow(userId, dealId) : Promise.resolve(null),
    ]);

    if (brief.status === "fulfilled" && brief.value) {
      if (brief.value.generator !== "llm") {
        problems.push(
          brief.value.error ??
            "The AI reading did not run (check ANTHROPIC_API_KEY in Vercel); nothing was filled.",
        );
      }
      filled.push(...brief.value.filled);
    } else if (brief.status === "rejected") {
      problems.push(`The brief did not finish: ${errText(brief.reason)}`);
    }

    if (sow.status === "fulfilled" && sow.value) {
      const { data: fresh } = await db()
        .from("portal_accounts")
        .select("intake")
        .eq("id", dealId)
        .maybeSingle();
      const { sowTimelinePatch } = await import("./sow-plan");
      const { timeline, accepted } = sowTimelinePatch(
        readIntake(fresh?.intake),
        sow.value.proposal,
        (row) => `${row.kind.slice(0, 4)}-${Math.random().toString(36).slice(2, 8)}`,
      );
      await mergeIntake(dealId, {}, timeline);
      if (accepted) filled.push(`${accepted} service${accepted === 1 ? "" : "s"} from the SOW`);
    } else if (sow.status === "rejected") {
      problems.push(`The SOW could not be read: ${errText(sow.reason)}`);
    }

    // The customer's page exists from here: the deck and the link in the
    // AE reply both point at it.
    if (!before.welcome_share_url) {
      try {
        const { issueWelcomeLinkAs } = await import("./welcome.server");
        await issueWelcomeLinkAs(userId, dealId);
      } catch (e) {
        problems.push(`The customer's link was not made: ${errText(e)}`);
      }
    }
  } catch (e) {
    problems.push(errText(e));
  }

  const status = problems.length && !filled.length ? "failed" : "done";
  const { data: after } = await db()
    .from("portal_accounts")
    .select("intake")
    .eq("id", dealId)
    .maybeSingle();
  const again = readIntake(after?.intake).ai_reading?.again ?? false;
  await mergeIntake(dealId, {
    ai_reading: {
      status,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      filled: filled.slice(0, 30),
      error: problems.length ? problems.join(" ").slice(0, 500) : null,
      again,
    },
  });
  return { status, filled, error: problems.length ? problems.join(" ") : null };
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
