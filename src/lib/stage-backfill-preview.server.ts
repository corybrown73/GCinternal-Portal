import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  previewStageBackfill,
  type BackfillCandidate,
  type ExistingStageInstanceRow,
  type ImplementationRow,
  type PublishedTemplateRow,
  type StageHistoryRow,
  type TemplateStageRow,
} from "./server/stage-backfill-preview";

const db = () => supabaseAdmin as any;

/** PostgREST's own default page size — exceeding it silently truncates unless paged. */
const PAGE_SIZE = 1000;

/**
 * Reads only — this file issues no insert, update, delete, or rpc call.
 * See src/lib/server/stage-backfill-preview.ts for the actual preview logic;
 * this is only the plain `.select()`s it runs on, and the shape of what it
 * fetches is exactly what that pure function declares it needs.
 *
 * Every page is fetched with `.range()` until a short page confirms there is
 * no more — a single unpaged `.select()` would silently cap at PostgREST's
 * own default limit on any table past that size, and a preview that quietly
 * dropped rows is worse than one that is slow. Every error is checked and
 * named: a failed read becomes a thrown error identifying which query
 * failed, never a silent empty array that reads as "nothing to review".
 *
 * Every implementation not superseded is read (not only ones already known
 * to lack stage_instances): classifying "already has rows" vs "none at all"
 * vs "some, but not a clean match" is the pure function's job, from the raw
 * rows, not a pre-filter that could hide the partial case.
 */
export async function loadStageBackfillPreview(): Promise<BackfillCandidate[]> {
  const fetchAll = async <T>(label: string, build: () => any): Promise<T[]> => {
    const rows: T[] = [];
    let from = 0;
    for (;;) {
      const { data, error } = await build().range(from, from + PAGE_SIZE - 1);
      if (error) {
        throw new Error(`stage-backfill-preview: could not read "${label}": ${error.message}`);
      }
      const page = (data ?? []) as T[];
      rows.push(...page);
      if (page.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }
    return rows;
  };

  const [implementations, history, existingInstances, templates] = await Promise.all([
    fetchAll<ImplementationRow>("implementations", () =>
      db()
        .from("implementations")
        .select("id, name, current_stage, journey_type")
        .is("superseded_by_implementation_id", null),
    ),
    fetchAll<StageHistoryRow>("implementation_stage_history", () =>
      db()
        .from("implementation_stage_history")
        .select("implementation_id, stage, entered_at, exited_at"),
    ),
    fetchAll<ExistingStageInstanceRow>("stage_instances", () =>
      db().from("stage_instances").select("implementation_id, stage_key"),
    ),
    fetchAll<PublishedTemplateRow>("journey_templates", () =>
      db()
        .from("journey_templates")
        .select("id, key, version, name, journey_type, status")
        .eq("status", "published"),
    ),
  ]);

  const templateIds = templates.map((t) => t.id);
  const templateStages = templateIds.length
    ? await fetchAll<TemplateStageRow>("journey_template_stages", () =>
        db()
          .from("journey_template_stages")
          .select("template_id, stage_key, name, position")
          .in("template_id", templateIds),
      )
    : [];

  return previewStageBackfill({
    implementations,
    history,
    existingInstances,
    templates,
    templateStages,
  });
}
