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

async function teamNames() {
  const { data } = await db().from("team_members").select("id,name");
  const map = new Map<string, string>((data ?? []).map((m: any) => [m.id, m.name]));
  return (id: string | null | undefined) => (id ? (map.get(id) ?? null) : null);
}

/* -------------------------------------------------------------- the loaders */

async function implementationDocument(
  implementationId: string,
  completedAt: string,
): Promise<{ doc: CompletionDocument; impl: any } | null> {
  const { data: impl } = await db()
    .from("implementations")
    .select("*")
    .eq("id", implementationId)
    .maybeSingle();
  if (!impl) return null;

  const { data: customer } = await db()
    .from("customers")
    .select("name")
    .eq("id", impl.customer_id)
    .maybeSingle();

  const scoped = (table: string, select = "*") =>
    db().from(table).select(select).eq("implementation_id", implementationId);

  const [
    named,
    { data: stageHistory },
    { data: solutions },
    { data: mappings },
    { data: requirements },
    { data: decisions },
    { data: risks },
    { data: issues },
    { data: commitments },
    { data: approvals },
    { data: successCriteria },
    { data: workItems },
    { data: stageInstances },
  ] = await Promise.all([
    teamNames(),
    scoped("implementation_stage_history").order("entered_at", { ascending: true }),
    scoped("technical_solutions").order("created_at", { ascending: true }),
    scoped("field_mappings", "technical_solution_id"),
    scoped("requirements").order("title", { ascending: true }),
    scoped("decisions").order("decision_date", { ascending: true }),
    scoped("risks").order("identified_at", { ascending: true }),
    scoped("issues").order("raised_at", { ascending: true }),
    scoped("commitments").order("made_at", { ascending: true }),
    scoped("approvals").order("requested_at", { ascending: true }),
    scoped("success_criteria").order("description", { ascending: true }),
    scoped("work_items", "title,status,party,stage_instance_id,position").order("position", {
      ascending: true,
    }),
    scoped("stage_instances", "id,stage_key"),
  ]);

  const mappingCountBySolution = new Map<string, number>();
  for (const m of mappings ?? []) {
    const key = String(m.technical_solution_id);
    mappingCountBySolution.set(key, (mappingCountBySolution.get(key) ?? 0) + 1);
  }

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
      named,
      stageHistory: stageHistory ?? [],
      solutions: solutions ?? [],
      mappingCountBySolution,
      requirements: requirements ?? [],
      decisions: decisions ?? [],
      risks: risks ?? [],
      issues: issues ?? [],
      commitments: commitments ?? [],
      approvals: (approvals ?? []).filter((a: any) => a.approved_entity_type !== "internal_draft"),
      successCriteria: successCriteria ?? [],
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
    .select("*")
    .eq("id", solutionId)
    .maybeSingle();
  if (!solution) return null;

  const { data: impl } = await db()
    .from("implementations")
    .select("*")
    .eq("id", solution.implementation_id)
    .maybeSingle();
  if (!impl) return null;

  const [
    named,
    { data: customer },
    { data: notes },
    { data: mappings },
    { data: approvals },
    { data: evidence },
    { data: traceLinks },
    { data: decisions },
    { data: requirement },
  ] = await Promise.all([
    teamNames(),
    db().from("customers").select("name").eq("id", impl.customer_id).maybeSingle(),
    db()
      .from("technical_solution_notes")
      .select("*")
      .eq("technical_solution_id", solutionId)
      .order("created_at", { ascending: true }),
    db()
      .from("field_mappings")
      .select("*")
      .eq("technical_solution_id", solutionId)
      .order("created_at", { ascending: true }),
    db()
      .from("approvals")
      .select("*")
      .eq("approved_entity_type", "technical_solution")
      .eq("approved_entity_id", solutionId),
    db()
      .from("evidence")
      .select("*")
      .eq("related_entity_type", "technical_solution")
      .eq("related_entity_id", solutionId),
    db().from("trace_links").select("*"),
    db().from("decisions").select("*").eq("implementation_id", solution.implementation_id),
    solution.requirement_id
      ? db().from("requirements").select("title").eq("id", solution.requirement_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  // Decisions reach a solution through trace_links in either direction — the
  // same walk `loadTechnicalSolutions` does, kept identical so the record
  // shows what the solution page showed.
  const key = `technical_solution:${solutionId}`;
  const decisionMap = new Map((decisions ?? []).map((d: any) => [d.id, d]));
  const linked = (traceLinks ?? [])
    .filter(
      (l: any) =>
        `${l.from_entity_type}:${l.from_entity_id}` === key ||
        `${l.to_entity_type}:${l.to_entity_id}` === key,
    )
    .map((l: any) =>
      l.from_entity_type === "decision"
        ? decisionMap.get(l.from_entity_id)
        : l.to_entity_type === "decision"
          ? decisionMap.get(l.to_entity_id)
          : null,
    )
    .filter(Boolean);

  return {
    impl,
    doc: buildSolutionDocument({
      customerName: customer?.name ?? "Unknown customer",
      implementationName: impl.name ?? "Implementation",
      solution,
      completedAt,
      named,
      notes: notes ?? [],
      mappings: mappings ?? [],
      decisions: linked,
      approvals: approvals ?? [],
      evidence: evidence ?? [],
      requirementTitle: (requirement as any)?.title ?? null,
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
