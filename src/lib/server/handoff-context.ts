import { supabaseAdmin } from "@/integrations/supabase/client.server";

import { customerFacingName } from "../names";
import { liveImplementationForDeal } from "./deal-implementation";
import { paperworkOnFile } from "../won-gate";

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
    /** The name the customer reads: the typed customer-facing name, else the deal name cleaned. */
    customerFacingName: string;
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
    /**
     * What the signed SOW says, as the AI reading kept it: what is
     * delivered, what is excluded, what the customer owes, how done is
     * judged, the term and the people. Null until a reading has run.
     */
    reading: ReturnType<typeof import("../sow-plan").sowReadingSummary> | null;
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
  /**
   * The plan the welcome page and Kickoff View show, computed the same way
   * (closeDateFor + timelineFor over the intake). It exists before the close:
   * a deal not yet won is planned as if it closed today. Null for a partner
   * deal, which runs its partner's journey instead (see planUnavailable).
   */
  plan: HandoffPlan | null;
  /** Why there is no plan, when there is none. */
  planUnavailable?: string;
  /** How many projects this customer already has. Feeds the path decision. */
  priorImplementations: number;
  /** What a model should say it does not know, rather than inventing. */
  gaps: string[];
};

export type HandoffPlan = {
  /** How to read the dates below. */
  basis: string;
  /** Day 0 of the plan. */
  closeDate: string;
  /** intake — a person set it; stage — the day the deal was won; today — not won yet, planned as if today. */
  closeSource: "intake" | "stage" | "today";
  /** The plan's Functional (live) date: the first form in their users' hands. */
  liveDate: string;
  /** The day it actually went live, when marked. */
  liveDoneOn: string | null;
  /** Every step of the plan, in date order. `booked` is set for calls only: a time is recorded. */
  milestones: Array<{
    key: string;
    label: string;
    kind: string;
    date: string;
    booked: boolean | null;
    doneOn: string | null;
    phase: number;
  }>;
  /** Phases 2 and up, with their end dates. Tentative dates are earliest, not committed. */
  phases: Array<{
    phase: number;
    label: string;
    startsOn: string | null;
    endsOn: string | null;
    tentative: boolean;
    services: string[];
  }>;
  /** The stored plan end on the project (target_date, else target_launch_date). Null before a project. */
  planEnd: string | null;
  /** The graduation date agreed with the customer (stage_targets.complete), when one is set. */
  graduationTarget: string | null;
  /** Agreed stage completion targets, when set. */
  stageTargets: Record<string, string | null>;
  /**
   * Dates the signed SOW names, as the SOW reading typed them. ADVISORY: they
   * are shown here and never written into the plan's dates, its stage
   * targets or its overrides.
   */
  sowDates: {
    advisory: true;
    note: string;
    dates: Array<{ type: string; date: string; end: string | null; quote: string }>;
  };
};

export async function loadHandoffContext(
  dealId: string,
  opts: {
    /**
     * False skips the plan block. buildOnboardingDeckInput reads this context
     * on every welcome page view and builds the same timeline itself.
     */
    plan?: boolean;
  } = {},
): Promise<HandoffContext | null> {
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

  // The kept reading of the document, so a model sees what was sold
  // without reading the PDF again. Never fatal: a context without it is
  // today's context.
  let reading: HandoffContext["sow"]["reading"] = null;
  let readingDates: HandoffPlan["sowDates"]["dates"] | null = null;
  try {
    const { loadSowReading } = await import("./ai/readings");
    // By the file's path, not its bytes: this read serves pages, and a
    // download per page view is not worth the one case a path misses.
    const kept = await loadSowReading(dealId, { fetch: false });
    if (kept?.reading.readable) {
      const { sowReadingSummary } = await import("../sow-plan");
      reading = sowReadingSummary(kept.reading);
      readingDates = (kept.reading.dates ?? []).map((d) => ({
        type: d.type,
        date: d.date,
        end: d.end ?? null,
        quote: d.quote,
      }));
    }
  } catch (e) {
    console.error("[handoff-context] could not load the SOW reading", e);
  }

  const project = await loadProject(dealId, deal.customer_id as string | null);
  let plan: HandoffContext["plan"] = null;
  let planUnavailable: string | undefined;
  if (opts.plan !== false) {
    try {
      const built = await loadHandoffPlan(deal, project?.id ?? null, readingDates);
      plan = built.plan;
      planUnavailable = built.unavailable;
    } catch (e) {
      console.error("[handoff-context] could not build the plan", e);
      planUnavailable = "The plan could not be computed for this deal.";
    }
  }
  const priorImplementations = deal.customer_id
    ? Math.max(0, (await countImplementations(deal.customer_id as string)) - (project ? 1 : 0))
    : 0;

  const gaps: string[] = [];
  if ((reports ?? []).length === 0) {
    gaps.push(
      "No call notes have been uploaded for this deal. Anything about what the customer wants would be invention — say so rather than writing it.",
    );
  }
  // One rule for the paperwork (paperworkOnFile): a SOW, a contract, or a
  // stated reason there is no SOW.
  const paper = paperworkOnFile(deal);
  if (paper === null) {
    gaps.push("No SOW is recorded. Scope, value and dates cannot be stated as agreed facts.");
  } else if (paper === "contract") {
    gaps.push(
      "No SOW: contract only. Scope is the core plan plus what the contract names; nothing beyond it is agreed.",
    );
  } else if (paper === "no_sow") {
    gaps.push(
      "No SOW, and the reason is recorded. Scope is the core plan; nothing beyond it is agreed.",
    );
  }
  if (!deal.am_owner_id && !deal.se_owner_id) {
    gaps.push("Nobody is assigned on the GoCanvas side, so the team slide has no names.");
  }
  if (!project && plan) {
    gaps.push(
      `No project yet: the plan below is the proposed one, dated from close ${plan.closeDate}${
        plan.closeSource === "today" ? " (not won yet, so planned as if it closed today)" : ""
      }; there are no project stages and no task list.`,
    );
  } else if (!project) {
    gaps.push(
      "No project exists yet — there is no plan, no stages and no task list. The deck cannot show a timeline.",
    );
  }

  return {
    deal: {
      id: deal.id,
      name: deal.name,
      customerFacingName: customerFacingName(deal) || deal.name,
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
      reading,
    },
    callNotes: (reports ?? []).map((r: any) => ({
      title: r.title,
      kind: r.report_type,
      recordedAt: r.created_at,
      markdown: r.content_md,
    })),
    notes: (notes ?? []).map((n: any) => ({ recordedAt: n.created_at, markdown: n.body_md })),
    project,
    plan,
    ...(planUnavailable ? { planUnavailable } : {}),
    priorImplementations,
    gaps,
  };
}

/**
 * The plan block: the same shared helpers the welcome page and Kickoff View
 * use (closeDateFor, timelineFor), never buildOnboardingDeckInput, which
 * reads this context itself.
 */
export async function loadHandoffPlan(
  deal: Record<string, any>,
  implementationId: string | null,
  readingDates: HandoffPlan["sowDates"]["dates"] | null,
): Promise<{ plan: HandoffPlan | null; unavailable?: string }> {
  const { readIntake } = await import("../intake-answers");
  const intake = readIntake(deal["intake"]);
  const { isPartnerDeal } = await import("../partner-implementation");
  if (isPartnerDeal(intake)) {
    return {
      plan: null,
      unavailable:
        "A partner implementation runs its partner's journey, not the standard plan. There are no standard plan dates to state.",
    };
  }
  const [{ closeDateFor, timelineFor }, { loadPipelineStages }, { wonStage }] = await Promise.all([
    import("../onboarding-plan"),
    import("../pipeline-stages.server"),
    import("../pipeline-stages"),
  ]);
  const [{ data: history }, stages, stored] = await Promise.all([
    db()
      .from("portal_stage_transitions")
      .select("to_stage,occurred_at")
      .eq("account_id", String(deal["id"])),
    loadPipelineStages(),
    implementationId
      ? db()
          .from("implementations")
          .select("target_date,target_launch_date")
          .eq("id", implementationId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const close = closeDateFor({
    intake,
    stageHistory: (history ?? []) as Array<{ to_stage: string; occurred_at: string }>,
    wonStageKey: wonStage(stages).key,
  });
  const t = timelineFor(intake, close.date);
  const targets = intake.timeline.stage_targets;
  const sowDates =
    readingDates ??
    (intake.timeline.sow_dates ?? []).map((d) => ({
      type: d.type,
      date: d.date,
      end: d.end ?? null,
      quote: d.quote,
    }));
  const row = (stored as { data: Record<string, any> | null }).data;
  return {
    plan: {
      basis:
        close.source === "today"
          ? "Proposed plan: the deal is not won yet, so every date assumes it closes today. Dates move with the real close."
          : "The plan as the welcome page and Kickoff View show it today.",
      closeDate: close.date,
      closeSource: close.source,
      liveDate: t.liveDate,
      liveDoneOn: t.liveDoneOn,
      milestones: [...t.milestones]
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((m) => ({
          key: m.key,
          label: m.label,
          kind: m.kind,
          date: m.date,
          booked: m.kind === "call" ? Boolean(m.time) : null,
          doneOn: m.doneOn,
          phase: m.phase,
        })),
      phases: t.phases.map((p) => ({
        phase: p.phase,
        label: p.label,
        startsOn: p.startsOn,
        endsOn: p.endsOn,
        tentative: p.tentative,
        services: p.services.map((s) => s.name),
      })),
      planEnd: (row?.["target_date"] as string | null) ?? row?.["target_launch_date"] ?? null,
      graduationTarget: targets.complete.current_date ?? null,
      stageTargets: Object.fromEntries(
        Object.entries(targets).map(([k, v]) => [k, v.current_date ?? null]),
      ),
      sowDates: {
        advisory: true,
        note: "Dates the signed SOW names. Advisory only: they do not drive the plan, its stage targets or its overrides. Agree them with the customer; do not print them as plan dates.",
        dates: sowDates,
      },
    },
  };
}

async function countImplementations(customerId: string): Promise<number> {
  const { count } = await db()
    .from("implementations")
    .select("id", { count: "exact", head: true })
    .eq("customer_id", customerId);
  return count ?? 0;
}

async function loadProject(
  dealId: string,
  customerId: string | null,
): Promise<HandoffContext["project"]> {
  // The deal's own live project, not the customer's newest: an existing
  // customer's second deal must not read the first one's plan.
  const impl = await liveImplementationForDeal<any>(db(), {
    dealId,
    customerId,
    select: "id,name,journey_type,target_launch_date,owner_id",
  });
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
