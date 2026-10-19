import { supabaseAdmin } from "@/integrations/supabase/client.server";

import { newestActivity, type ActivityStamp } from "./deal-activity";

const db = () => supabaseAdmin as any;

/** A read that failed: the caller decides whether that stops its run. */
export class ActivityReadError extends Error {
  constructor(
    readonly what: string,
    error: { message?: string },
  ) {
    super(`could not read ${what}: ${error.message ?? String(error)}`);
  }
}

type Read = { data: unknown[] | null; error: { message?: string } | null };

/** PostgREST answers at most this many rows per request; the reads here page past it. */
export const ACTIVITY_PAGE = 1000;

/**
 * Every row a read matches, newest first, a page at a time. An unordered,
 * unpaged read stops quietly at the row cap, and on a busy window the rows
 * it drops can be the newest: a deal worked today would read as quiet.
 */
async function allRows(build: () => any, timeCol: string, pageSize: number): Promise<Read> {
  const data: unknown[] = [];
  for (let from = 0; ; from += pageSize) {
    const r = (await build()
      .order(timeCol, { ascending: false })
      .range(from, from + pageSize - 1)) as Read;
    if (r.error) return { data: null, error: r.error };
    const page = r.data ?? [];
    data.push(...page);
    if (page.length < pageSize) return { data, error: null };
  }
}

/**
 * The newest person activity per deal since `since` (ISO), read from where the
 * app already records each kind of work. Only rows with a person behind them:
 *
 * - portal_audit_log, actor_type 'user', on the deal or its live project:
 *   plan ticks and stage targets (deal.intake_updated), stage moves, SOW and
 *   contract uploads, link copies, project changes.
 * - portal_stage_transitions with an actor profile (a person moved the stage).
 * - portal_milestone_date_changes of kind 'direct' (Adjust plan dates).
 * - portal_onboarding_notes and portal_gong_reports with an author/uploader.
 * - On the live project: journal_entries with an author (notes), work_items
 *   ticked by someone (actions), account_files someone added (Files & links),
 *   and the account activity feed (audit_log) rows with a person.
 *
 * Every read must succeed; one that fails throws ActivityReadError rather
 * than answering "nobody worked on it".
 */
export async function loadPersonActivity(args: {
  dealIds: readonly string[];
  /** The deal's live (newest, not superseded) project, when it has one. */
  liveImplByDeal: ReadonlyMap<string, string>;
  since: string;
  /** Rows per request; the server's cap unless a test says otherwise. */
  pageSize?: number;
}): Promise<Map<string, string>> {
  const dealIds = [...new Set(args.dealIds)];
  if (!dealIds.length) return new Map();
  const dealByImpl = new Map<string, string>();
  for (const [dealId, implId] of args.liveImplByDeal)
    if (dealIds.includes(dealId)) dealByImpl.set(implId, dealId);
  const implIds = [...dealByImpl.keys()];
  const since = args.since;
  const page = args.pageSize ?? ACTIVITY_PAGE;
  const none: Read = { data: [], error: null };

  const [audit, moves, dates, notes, calls, journal, ticks, files, feed] = await Promise.all([
    allRows(
      () =>
        db()
          .from("portal_audit_log")
          .select("entity_id,created_at")
          .eq("actor_type", "user")
          .in("entity_id", [...dealIds, ...implIds])
          .gte("created_at", since),
      "created_at",
      page,
    ),
    allRows(
      () =>
        db()
          .from("portal_stage_transitions")
          .select("account_id,occurred_at")
          .in("account_id", dealIds)
          .not("actor_profile_id", "is", null)
          .gte("occurred_at", since),
      "occurred_at",
      page,
    ),
    allRows(
      () =>
        db()
          .from("portal_milestone_date_changes")
          .select("account_id,created_at")
          .in("account_id", dealIds)
          .eq("change_kind", "direct")
          .gte("created_at", since),
      "created_at",
      page,
    ),
    allRows(
      () =>
        db()
          .from("portal_onboarding_notes")
          .select("account_id,created_at")
          .in("account_id", dealIds)
          .not("author_id", "is", null)
          .gte("created_at", since),
      "created_at",
      page,
    ),
    allRows(
      () =>
        db()
          .from("portal_gong_reports")
          .select("account_id,created_at")
          .in("account_id", dealIds)
          .not("uploaded_by", "is", null)
          .gte("created_at", since),
      "created_at",
      page,
    ),
    implIds.length
      ? allRows(
          () =>
            db()
              .from("journal_entries")
              .select("implementation_id,created_at")
              .in("implementation_id", implIds)
              .not("author_id", "is", null)
              .gte("created_at", since),
          "created_at",
          page,
        )
      : none,
    implIds.length
      ? allRows(
          () =>
            db()
              .from("work_items")
              .select("implementation_id,completed_at")
              .in("implementation_id", implIds)
              .not("completed_by", "is", null)
              .gte("completed_at", since),
          "completed_at",
          page,
        )
      : none,
    implIds.length
      ? allRows(
          () =>
            db()
              .from("account_files")
              .select("implementation_id,created_at")
              .in("implementation_id", implIds)
              .not("added_by", "is", null)
              .gte("created_at", since),
          "created_at",
          page,
        )
      : none,
    implIds.length
      ? allRows(
          () =>
            db()
              .from("audit_log")
              .select("entity_id,changed_at")
              .in("entity_id", implIds)
              .not("changed_by", "is", null)
              .gte("changed_at", since),
          "changed_at",
          page,
        )
      : none,
  ]);

  const rows = <T>(what: string, r: Read | undefined): T[] => {
    if (r?.error) throw new ActivityReadError(what, r.error);
    return (r?.data ?? []) as T[];
  };
  const toDeal = (id: unknown) => {
    const s = String(id ?? "");
    return dealByImpl.get(s) ?? (dealIds.includes(s) ? s : "");
  };
  const stamps: ActivityStamp[] = [];
  for (const r of rows<{ entity_id: string; created_at: string }>("the activity log", audit))
    stamps.push({ dealId: toDeal(r.entity_id), at: r.created_at });
  for (const r of rows<{ account_id: string; occurred_at: string }>("the stage moves", moves))
    stamps.push({ dealId: toDeal(r.account_id), at: r.occurred_at });
  for (const [what, read] of [
    ["the date changes", dates],
    ["the onboarding notes", notes],
    ["the call notes", calls],
  ] as const)
    for (const r of rows<{ account_id: string; created_at: string }>(what, read))
      stamps.push({ dealId: toDeal(r.account_id), at: r.created_at });
  for (const r of rows<{ implementation_id: string; created_at: string }>(
    "the project notes",
    journal,
  ))
    stamps.push({ dealId: toDeal(r.implementation_id), at: r.created_at });
  for (const r of rows<{ implementation_id: string; completed_at: string }>(
    "the ticked actions",
    ticks,
  ))
    stamps.push({ dealId: toDeal(r.implementation_id), at: r.completed_at });
  for (const r of rows<{ implementation_id: string; created_at: string }>("the files", files))
    stamps.push({ dealId: toDeal(r.implementation_id), at: r.created_at });
  for (const r of rows<{ entity_id: string; changed_at: string }>("the activity feed", feed))
    stamps.push({ dealId: toDeal(r.entity_id), at: r.changed_at });
  return newestActivity(stamps);
}
