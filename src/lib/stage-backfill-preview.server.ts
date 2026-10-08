import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { previewStageBackfill, type BackfillCandidate } from "./server/stage-backfill-preview";

const db = () => supabaseAdmin as any;

/**
 * Reads only — this file issues no insert, update, delete, or rpc call.
 * See src/lib/server/stage-backfill-preview.ts for the actual preview logic;
 * this is only the plain `.select()`s it runs on, and the shape of what it
 * fetches is exactly what that pure function declares it needs.
 *
 * Every implementation not superseded is read (not only ones already known
 * to lack stage_instances): classifying "already has rows" vs "none at all"
 * vs "some, but not a clean match" is the pure function's job, from the raw
 * counts, not a pre-filter that could hide the partial case.
 */
export async function loadStageBackfillPreview(): Promise<BackfillCandidate[]> {
  const [{ data: implementations }, { data: history }, { data: existingInstances }] =
    await Promise.all([
      db()
        .from("implementations")
        .select("id, name, current_stage, journey_type")
        .is("superseded_by_implementation_id", null),
      db()
        .from("implementation_stage_history")
        .select("implementation_id, stage, entered_at, exited_at"),
      db().from("stage_instances").select("implementation_id"),
    ]);

  const { data: templates } = await db()
    .from("journey_templates")
    .select("id, key, version, name, journey_type, status")
    .eq("status", "published");

  const templateIds = (templates ?? []).map((t: { id: string }) => t.id);
  const { data: templateStages } = templateIds.length
    ? await db()
        .from("journey_template_stages")
        .select("template_id, stage_key, name, position")
        .in("template_id", templateIds)
    : { data: [] };

  return previewStageBackfill({
    implementations: implementations ?? [],
    history: history ?? [],
    existingInstances: existingInstances ?? [],
    templates: templates ?? [],
    templateStages: templateStages ?? [],
  });
}
