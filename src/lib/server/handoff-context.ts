import { supabaseAdmin } from "@/integrations/supabase/client.server";

const db = () => supabaseAdmin as any;

/**
 * Everything a model needs to write the handoff deck, in one read.
 *
 * WHAT THIS IS FOR. The MCP server hands this to Claude, which reads the call
 * notes and the SOW and comes back with the deck's field values. The point of
 * assembling it here rather than exposing six tools is that a model asking six
 * questions to answer one costs six round trips and still misses the thing
 * nobody thought to expose.
 *
 * IT INCLUDES THE RAW TRANSCRIPTS. That is the whole idea — the summary the
 * app already stores is somebody else's reading, and a deck built from a
 * summary of a summary loses the sentence where the customer said what they
 * actually wanted. The notes go across verbatim.
 *
 * IT ALSO SAYS WHAT IS MISSING. A deal with no call notes and no SOW produces
 * a context object that says so in `gaps`, so the model leads with that
 * instead of writing a confident deck out of nothing.
 */

export type HandoffContext = {
  deal: {
    id: string;
    name: string;
    stage: string;
    domain: string | null;
    arr: number | null;
    products: string[];
    summary: string | null;
    primaryContact: { name: string | null; email: string | null; role: string | null };
    amOwner: string | null;
    seOwner: string | null;
    createdAt: string;
  };
  sow: {
    reference: string | null;
    signedDate: string | null;
    value: number | null;
    documentName: string | null;
    /** A short-lived link to the uploaded PDF, when one was uploaded. */
    documentUrl: string | null;
    /** True when the SOW is a file we hold rather than a link somewhere else. */
    uploaded: boolean;
  };
  /** Gong reports and account maps, verbatim. */
  callNotes: Array<{ title: string; kind: string; recordedAt: string; markdown: string }>;
  /** Reviewed onboarding notes, verbatim. */
  notes: Array<{ recordedAt: string; markdown: string }>;
  /** The project, once handoff has happened. */
  project: {
    id: string;
    name: string;
    journeyType: string | null;
    targetLaunchDate: string | null;
    lead: string | null;
    stages: Array<{ name: string; targetDays: number | null }>;
    openCustomerTasks: Array<{ title: string; stage: string; due: string | null }>;
    requirements: Array<{ title: string; inScope: boolean }>;
    successCriteria: Array<{ description: string; target: string | null }>;
    openRisks: Array<{ title: string; mitigation: string | null }>;
    solutions: string[];
  } | null;
  /** How many projects this customer already has. Feeds the path decision. */
  priorImplementations: number;
  /** What a model should say it does not know, rather than inventing. */
  gaps: string[];
};

export async function loadHandoffContext(dealId: string): Promise<HandoffContext | null> {
  const { data: deal } = await db()
    .from("portal_accounts")
    .select("*")
    .eq("id", dealId)
    .maybeSingle();
  if (!deal) return null;

  const [{ data: owners }, { data: reports }, { data: notes }] = await Promise.all([
    db()
      .from("team_members")
      .select("id,name")
      .in("id", [deal.am_owner_id, deal.se_owner_id].filter(Boolean)),
    db()
      .from("portal_gong_reports")
      .select("title,report_type,content_md,created_at")
      .eq("account_id", dealId)
      .order("created_at", { ascending: true }),
    db()
      .from("portal_onboarding_notes")
      .select("body_md,created_at")
      .eq("account_id", dealId)
      .eq("review_status", "reviewed")
      .order("created_at", { ascending: true }),
  ]);

  const named = new Map<string, string>(
    (owners ?? []).map((o: any) => [String(o.id), String(o.name)]),
  );

  // The SOW link is signed on demand: the bucket is private and a contract
  // must not sit behind a URL that works for anyone who has it.
  let sowUrl: string | null = null;
  if (deal.sow_document_path) {
    try {
      const { data } = await db()
        .storage.from("attachments")
        .createSignedUrl(deal.sow_document_path, 60 * 60);
      sowUrl = data?.signedUrl ?? null;
    } catch (e) {
      console.error("[handoff-context] could not sign the sow url", e);
    }
  }

  const project = await loadProject(deal.customer_id as string | null);
  const priorImplementations = deal.customer_id
    ? Math.max(0, (await countImplementations(deal.customer_id as string)) - (project ? 1 : 0))
    : 0;

  const gaps: string[] = [];
  if ((reports ?? []).length === 0) {
    gaps.push(
      "No call notes have been uploaded for this deal. Anything about what the customer wants would be invention — say so rather than writing it.",
    );
  }
  if (!deal.sow_reference && !deal.sow_document_path && !deal.sow_document_url) {
    gaps.push("No SOW is recorded. Scope, value and dates cannot be stated as agreed facts.");
  }
  if (!deal.am_owner_id && !deal.se_owner_id) {
    gaps.push("Nobody is assigned on the GoCanvas side, so the team slide has no names.");
  }
  if (!project) {
    gaps.push(
      "No project exists yet — there is no plan, no stages and no task list. The deck cannot show a timeline.",
    );
  }

  return {
    deal: {
      id: deal.id,
      name: deal.name,
      stage: deal.stage,
      domain: deal.domain ?? null,
      arr: deal.arr ?? null,
      products: deal.products ?? [],
      summary: deal.summary ?? null,
      primaryContact: {
        name: deal.primary_contact_name ?? null,
        email: deal.primary_contact_email ?? null,
        role: deal.primary_contact_role ?? null,
      },
      amOwner: named.get(deal.am_owner_id) ?? null,
      seOwner: named.get(deal.se_owner_id) ?? null,
      createdAt: deal.created_at,
    },
    sow: {
      reference: deal.sow_reference ?? null,
      signedDate: deal.sow_signed_date ?? null,
      value: deal.sow_value ?? null,
      documentName: deal.sow_document_name ?? null,
      documentUrl: sowUrl ?? deal.sow_document_url ?? null,
      uploaded: Boolean(deal.sow_document_path),
    },
    callNotes: (reports ?? []).map((r: any) => ({
      title: r.title,
      kind: r.report_type,
      recordedAt: r.created_at,
      markdown: r.content_md,
    })),
    notes: (notes ?? []).map((n: any) => ({ recordedAt: n.created_at, markdown: n.body_md })),
    project,
    priorImplementations,
    gaps,
  };
}

async function countImplementations(customerId: string): Promise<number> {
  const { count } = await db()
    .from("implementations")
    .select("id", { count: "exact", head: true })
    .eq("customer_id", customerId);
  return count ?? 0;
}

async function loadProject(customerId: string | null): Promise<HandoffContext["project"]> {
  if (!customerId) return null;
  const { data: impl } = await db()
    .from("implementations")
    .select("id,name,journey_type,target_launch_date,owner_id")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!impl) return null;

  const [
    { data: lead },
    { data: stages },
    { data: tasks },
    { data: requirements },
    { data: criteria },
    { data: risks },
    { data: solutions },
  ] = await Promise.all([
    impl.owner_id
      ? db().from("team_members").select("name").eq("id", impl.owner_id).maybeSingle()
      : Promise.resolve({ data: null }),
    db()
      .from("stage_instances")
      .select("id,name,target_duration_days,position")
      .eq("implementation_id", impl.id)
      .order("position", { ascending: true }),
    db()
      .from("work_items")
      .select("title,stage_instance_id,due_at,position")
      .eq("implementation_id", impl.id)
      .eq("party", "customer")
      .neq("status", "done")
      .neq("status", "skipped")
      .order("position", { ascending: true })
      .limit(10),
    db().from("requirements").select("title,scope_status").eq("implementation_id", impl.id),
    db()
      .from("success_criteria")
      .select("description,target_value")
      .eq("implementation_id", impl.id),
    db()
      .from("risks")
      .select("title,mitigation")
      .eq("implementation_id", impl.id)
      .neq("status", "closed"),
    db().from("technical_solutions").select("title").eq("implementation_id", impl.id),
  ]);

  const rows = (stages ?? []) as Array<Record<string, any>>;
  const stageName = (id: string) => rows.find((s) => String(s["id"]) === id)?.["name"] ?? "—";

  return {
    id: impl.id,
    name: impl.name,
    journeyType: impl.journey_type ?? null,
    targetLaunchDate: impl.target_launch_date ?? null,
    lead: (lead as any)?.name ?? null,
    stages: rows.map((s) => ({
      name: String(s["name"]),
      targetDays: (s["target_duration_days"] as number | null) ?? null,
    })),
    openCustomerTasks: ((tasks ?? []) as Array<Record<string, any>>).map((t) => ({
      title: String(t["title"]),
      stage: String(stageName(String(t["stage_instance_id"] ?? ""))),
      due: (t["due_at"] as string | null) ?? null,
    })),
    requirements: ((requirements ?? []) as Array<Record<string, any>>).map((r) => ({
      title: String(r["title"]),
      inScope: r["scope_status"] !== "out_of_scope",
    })),
    successCriteria: ((criteria ?? []) as Array<Record<string, any>>).map((c) => ({
      description: String(c["description"]),
      target: (c["target_value"] as string | null) ?? null,
    })),
    openRisks: ((risks ?? []) as Array<Record<string, any>>).map((r) => ({
      title: String(r["title"]),
      mitigation: (r["mitigation"] as string | null) ?? null,
    })),
    solutions: ((solutions ?? []) as Array<Record<string, any>>).map((s) => String(s["title"])),
  };
}
