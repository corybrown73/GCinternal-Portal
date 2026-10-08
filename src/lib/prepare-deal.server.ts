/**
 * Prepare the deal from its sources, with nobody pressing anything.
 *
 * The reading itself is a background job (server/ai/jobs.ts, worked by
 * /api/cron/ai-jobs one step at a time): the SOW read once and kept, the
 * brief from the calls and notes, the intake's blanks, the customer's
 * link. This only queues it and wakes the cron, so the request that asked
 * returns at once and the progress is on the record (intake.ai_reading).
 *
 * One at a time per deal: a request while one is queued or running is
 * folded into it, and only a job past its source snapshot is asked for one
 * more run afterwards. `force` reads even when nothing changed since the
 * last reading — "Read again" means it.
 */
export async function prepareDeal(
  userId: string,
  dealId: string,
  opts: { force?: boolean | undefined } = {},
): Promise<{ status: "done" | "failed" | "queued"; filled: string[]; error: string | null }> {
  const { requireSalesEditor } = await import("./presale.server");
  const profile = await requireSalesEditor(userId);
  const { enqueueAiJob, kickAiJobs } = await import("./server/ai/jobs");
  await enqueueAiJob({
    kind: "prepare_deal",
    dealId,
    trigger: "manual",
    requestedBy: profile.id,
    force: Boolean(opts.force),
  });
  await kickAiJobs();
  return { status: "queued", filled: [], error: null };
}
