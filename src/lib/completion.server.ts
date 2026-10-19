import { supabaseAdmin } from "@/integrations/supabase/client.server";

import { appUrl } from "./app-url";
import {
  buildImplementationDocument,
  buildSolutionDocument,
  summaryText,
  type CompletionDocument,
} from "./completion-record";
import { stageDefinition } from "./lifecycle";
import { generateCompletionToken, hashToken } from "./server/plan-tokens";

const db = () => supabaseAdmin as any;

/**
 * Issuing a completion record.
 *
 * WHAT THIS IS FOR. When a project graduates to CS, or an engineer marks a
 * solution validated, this freezes what was done into one document, files it
 * in the account's attachments, and puts it on the event outbox so a consumer
 * can write the note and attachment into Salesforce.
 *
 * WHAT GOES IN IT. The document is public: anyone holding its link can read it.
 * Only what `completion-record.ts` admits is in it. The loaders below select
 * only the columns that projection can use, so owners, builders, internal
 * notes and risk or decision text are never read here at all.
 *
 * WHERE SALESFORCE ACTUALLY HAPPENS. Not here. This app has never held
 * Salesforce credentials and does not start now: it emits
 * `completion.recorded` carrying the note body, the Salesforce ids and a URL
 * the PDF is reachable at, and a webhook consumer (the same path the
 * `salesforce.write_back` event already takes) does the writing. That boundary
 * is why the note body is stored rather than derived at send time — the
 * consumer files exactly what the record says.
 *
 * IT NEVER THROWS INTO THE CALLER. Generating a record is a consequence of
 * finishing work, not a precondition for it. A stage advance that has already
 * been written to history must not be undone because a PDF's worth of JSON
 * could not be assembled. Failures are logged and reported in the return
 * value; `generateCompletionRecord` is also callable directly, so a record
 * that failed to issue can be issued again without redoing the work.
 */

export type CompletionSubject =
  { type: "implementation"; id: string } | { type: "solution"; id: string };

export type CompletionResult =
  { issued: true; id: string; version: number; url: string } | { issued: false; reason: string };

const stageLabel = (key: string) => stageDefinition(key)?.label ?? key;

/* -------------------------------------------------------------- the loaders */

async function implementationDocument(
  implementationId: string,
  completedAt: string,
): Promise<{ doc: CompletionDocument; impl: any } | null> {
  const { data: impl } = await db()
    .from("implementations")
    .select(
      "id,name,customer_id,contract_start_date,created_at,go_live_at,actual_launch_date,salesforce_opportunity_id",
    )
    .eq("id", implementationId)
    .maybeSingle();
  if (!impl) return null;

  const { data: customer } = await db()
    .from("customers")
    .select("name")
    .eq("id", impl.customer_id)
    .maybeSingle();

  const scoped = (table: string, select: string) =>
    db().from(table).select(select).eq("implementation_id", implementationId);

  const [
    { data: stageHistory },
    { data: commitments },
    { data: workItems },
    { data: stageInstances },
  ] = await Promise.all([
    scoped("implementation_stage_history", "stage,entered_at,exited_at").order("entered_at", {
      ascending: true,
    }),
    scoped("commitments", "description,committed_to,status,made_at,due_date,fulfilled_at").order(
      "made_at",
      { ascending: true },
    ),
    scoped("work_items", "title,status,visibility,stage_instance_id,position").order("position", {
      ascending: true,
    }),
    scoped("stage_instances", "id,stage_key"),
  ]);

  // work_items carries the stage as `stage_instance_id`, not a stage key. The
  // document wants the label a person would recognise, so the join happens
  // here rather than being faked in the projection.
  const stageKeyById = new Map<string, string>(
    (stageInstances ?? []).map((s: any) => [String(s.id), String(s.stage_key)]),
  );

  return {
    impl,
    doc: buildImplementationDocument({
      customerName: customer?.name ?? "Unknown customer",
      implementation: impl,
      completedAt,
      stageHistory: stageHistory ?? [],
      commitments: commitments ?? [],
      workItems: (workItems ?? []).map((w: any) => ({
        ...w,
        stage_key: stageKeyById.get(String(w.stage_instance_id)) ?? "",
      })),
      stageLabel,
    }),
  };
}

async function solutionDocument(
  solutionId: string,
  completedAt: string,
): Promise<{ doc: CompletionDocument; impl: any } | null> {
  const { data: solution } = await db()
    .from("technical_solutions")
    .select("id,title,created_at,implementation_id")
    .eq("id", solutionId)
    .maybeSingle();
  if (!solution) return null;

  const { data: impl } = await db()
    .from("implementations")
    .select("id,name,customer_id,salesforce_opportunity_id")
    .eq("id", solution.implementation_id)
    .maybeSingle();
  if (!impl) return null;

  const { data: customer } = await db()
    .from("customers")
    .select("name")
    .eq("id", impl.customer_id)
    .maybeSingle();

  return {
    impl,
    doc: buildSolutionDocument({
      customerName: customer?.name ?? "Unknown customer",
      implementationName: impl.name ?? "Implementation",
      solution,
      completedAt,
    }),
  };
}

/* ---------------------------------------------------------------- issuing */

export async function generateCompletionRecord(args: {
  subject: CompletionSubject;
  /** portal_profiles id of whoever finished it. */
  actorProfileId?: string | null;
}): Promise<CompletionResult> {
  try {
    const completedAt = new Date().toISOString();
    const loaded =
      args.subject.type === "implementation"
        ? await implementationDocument(args.subject.id, completedAt)
        : await solutionDocument(args.subject.id, completedAt);

    if (!loaded) return { issued: false, reason: "the subject no longer exists" };
    const { doc, impl } = loaded;

    const minted = generateCompletionToken();
    const url = `${appUrl()}/api/completion-record/${minted.token}`;
    const body = summaryText(doc, url);

    const { data: row, error } = await db()
      .from("completion_records")
      .insert({
        implementation_id: impl.id,
        subject_type: args.subject.type,
        subject_id: args.subject.id,
        // Ignored by the database, which assigns the real number. Sent because
        // the column is NOT NULL and the trigger overwrites it.
        version: 1,
        title: doc.title,
        content: doc,
        summary_text: body,
        share_token_hash: minted.hash,
        salesforce_account_id: impl.salesforce_account_id ?? null,
        salesforce_opportunity_id: impl.salesforce_opportunity_id ?? null,
        generated_by: args.actorProfileId ?? null,
      })
      .select("id,version")
      .single();
    if (error || !row) {
      console.error("[completion] insert failed", error?.message);
      return { issued: false, reason: error?.message ?? "the record could not be stored" };
    }

    // File it where people look for account documents. A link row, not an
    // upload: the PDF is rendered from the frozen document on request, so
    // there is no file to put in a bucket and no second copy to drift.
    const label =
      args.subject.type === "solution"
        ? `Completion record — ${doc.title}`
        : `Completion record — ${doc.implementation_name}`;
    const { data: file } = await db()
      .from("account_files")
      .insert({
        implementation_id: impl.id,
        kind: "doc",
        title: row.version > 1 ? `${label} (v${row.version})` : label,
        description:
          "What was done, frozen at completion. Generated, not uploaded — it cannot change.",
        external_url: url,
        added_by: args.actorProfileId ?? null,
      })
      .select("id")
      .maybeSingle();
    if (file?.id) {
      await db().from("completion_records").update({ account_file_id: file.id }).eq("id", row.id);
    }

    const { audit } = await import("./server/audit");
    await audit({
      actor_type: args.actorProfileId ? "user" : "system",
      actor_id: args.actorProfileId ?? null,
      action: "completion.recorded",
      entity_type: args.subject.type === "solution" ? "technical_solution" : "implementation",
      entity_id: args.subject.id,
      payload: {
        completion_record_id: row.id,
        version: row.version,
        implementation_id: impl.id,
      },
    });

    // The outbox. What a Salesforce consumer needs and nothing it does not:
    // where to file it, what to write, and where to fetch the PDF. The token
    // is IN the url on purpose — it is the whole of the authorization on that
    // route, and a consumer that cannot fetch the document cannot attach it.
    const { emitEvent } = await import("./server/events");
    await emitEvent({
      event_type: "completion.recorded",
      entity_type: args.subject.type === "solution" ? "technical_solution" : "implementation",
      entity_id: args.subject.id,
      implementation_id: impl.id,
      payload: {
        completion_record_id: row.id,
        version: row.version,
        subject_type: args.subject.type,
        title: doc.title,
        customer_name: doc.customer_name,
        completed_at: completedAt,
        salesforce_account_id: impl.salesforce_account_id ?? null,
        salesforce_opportunity_id: impl.salesforce_opportunity_id ?? null,
        note_title: label,
        note_body: body,
        document_url: url,
        document_filename: `${doc.customer_name} — ${doc.title} — completion record.pdf`
          .replace(/[\\/:*?"<>|]/g, "-")
          .slice(0, 200),
      },
      dedupe_key: `cr:${row.id}`,
    });

    return { issued: true, id: row.id, version: row.version, url };
  } catch (e) {
    console.error("[completion] generate threw", e);
    return { issued: false, reason: e instanceof Error ? e.message : "unknown failure" };
  }
}

/* ---------------------------------------------------------------- reading */

export async function completionRecordForToken(
  rawToken: string,
): Promise<{ content: CompletionDocument; title: string; version: number } | null> {
  const { data } = await db()
    .from("completion_records")
    .select("content,title,version")
    .eq("share_token_hash", hashToken(rawToken))
    .maybeSingle();
  if (!data) return null;
  return {
    content: data.content as CompletionDocument,
    title: data.title as string,
    version: data.version as number,
  };
}

export type CompletionRecordRow = {
  id: string;
  subject_type: "implementation" | "solution";
  subject_id: string;
  version: number;
  title: string;
  created_at: string;
};

/** Every record issued for an account, newest first. */
export async function loadCompletionRecords(
  implementationId: string,
): Promise<CompletionRecordRow[]> {
  const { data } = await db()
    .from("completion_records")
    .select("id,subject_type,subject_id,version,title,created_at")
    .eq("implementation_id", implementationId)
    .order("created_at", { ascending: false });
  return (data ?? []) as CompletionRecordRow[];
}
