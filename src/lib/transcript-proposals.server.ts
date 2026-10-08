import { supabaseAdmin } from "@/integrations/supabase/client.server";

import {
  proposalApplyPlan,
  type EvidenceProposalRow,
  type ProposalApplyPlan,
  type ProposalPicks,
} from "./transcript-analysis";

const db = () => supabaseAdmin as any;

/**
 * The kept transcript proposals: what the panel lists, and the two clicks a
 * person makes on a row. Apply runs the same create paths a hand-entered
 * risk, issue, decision, note, owner change, plan date or handoff answer
 * runs — then marks the row with what it created. Dismiss only marks the
 * row. Both say who decided and when, and both leave an audit row.
 */

/** A reading the panel has something to say about: still running, or finished with nothing to show. */
export type TranscriptJob = {
  attachment_id: string;
  title: string | null;
  status: "queued" | "running" | "done" | "failed";
  step: string | null;
  /** Why nothing came of it: the model's own reason, or the runner's last error. */
  problem: string | null;
  /** How many rows the reading kept; null while it runs. */
  proposals: number | null;
};

export type TranscriptWork = {
  /**
   * The latest reading per uploaded file from the last week, when it is
   * still running or ended with nothing to list: a failure, an unreadable
   * file, or a transcript that proposed nothing. A reading whose proposals
   * are listed needs no line of its own.
   */
  jobs: TranscriptJob[];
  proposals: EvidenceProposalRow[];
};

/** Readings older than this have had their say; the evidence row remains. */
const JOB_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export async function loadTranscriptWork(
  implementationId: string,
  now: Date = new Date(),
): Promise<TranscriptWork> {
  const [{ data: jobs }, { data: rows }] = await Promise.all([
    db()
      .from("portal_ai_jobs")
      .select("subject_id,status,step,result,last_error,created_at")
      .eq("kind", "analyze_transcript")
      .eq("implementation_id", implementationId)
      .gte("created_at", new Date(now.getTime() - JOB_WINDOW_MS).toISOString())
      .order("created_at", { ascending: false }),
    db()
      .from("evidence_proposals")
      .select("*")
      .eq("implementation_id", implementationId)
      .order("created_at", { ascending: false }),
  ]);
  const list = (rows ?? []) as Array<Record<string, any>>;

  const evidenceIds = [...new Set(list.map((r) => r["evidence_id"]).filter(Boolean))] as string[];
  const dupIds = (type: string) =>
    [
      ...new Set(
        list
          .filter((r) => r["duplicate_of_type"] === type && r["duplicate_of_id"])
          .map((r) => r["duplicate_of_id"]),
      ),
    ] as string[];
  const titlesOf = async (table: string, ids: string[]): Promise<Map<string, string>> => {
    if (!ids.length) return new Map();
    const { data } = await db().from(table).select("id,title").in("id", ids);
    return new Map(
      ((data ?? []) as Array<{ id: string; title: string | null }>).map((r) => [
        String(r.id),
        r.title ?? "Untitled",
      ]),
    );
  };
  // Newest first, so the first job seen per file is its latest reading.
  const latestJobs = new Map<string, Record<string, any>>();
  for (const j of (jobs ?? []) as Array<Record<string, any>>) {
    const subject = j["subject_id"] ? String(j["subject_id"]) : null;
    if (subject && !latestJobs.has(subject)) latestJobs.set(subject, j);
  }
  const jobFiles = [...latestJobs.keys()];

  const [evidence, riskTitles, issueTitles, decisionTitles, files] = await Promise.all([
    evidenceIds.length
      ? db().from("evidence").select("id,title,created_at").in("id", evidenceIds)
      : Promise.resolve({ data: [] }),
    titlesOf("risks", dupIds("risk")),
    titlesOf("issues", dupIds("issue")),
    titlesOf("decisions", dupIds("decision")),
    titlesOf("account_files", jobFiles),
  ]);
  const evidenceById = new Map(
    ((evidence.data ?? []) as Array<{ id: string; title: string; created_at: string }>).map((e) => [
      String(e.id),
      e,
    ]),
  );
  const dupTitle = (type: string | null, id: string | null): string | null => {
    if (!type || !id) return null;
    const map = type === "risk" ? riskTitles : type === "issue" ? issueTitles : decisionTitles;
    return map.get(id) ?? null;
  };

  const proposals: EvidenceProposalRow[] = list.map((r) => {
    const ev = r["evidence_id"] ? evidenceById.get(String(r["evidence_id"])) : undefined;
    return {
      id: String(r["id"]),
      implementation_id: String(r["implementation_id"]),
      evidence_id: r["evidence_id"] ?? null,
      attachment_id: r["attachment_id"] ?? null,
      job_id: r["job_id"] ?? null,
      type: r["type"],
      title: String(r["title"] ?? "Untitled"),
      text: String(r["text"] ?? ""),
      quote: r["quote"] ?? null,
      confidence: r["confidence"] ?? "uncertain",
      severity: r["severity"] ?? null,
      likelihood: r["likelihood"] ?? null,
      owner_team_member_id: r["owner_team_member_id"] ?? null,
      proposed_date: r["proposed_date"] ?? null,
      duplicate_of_type: r["duplicate_of_type"] ?? null,
      duplicate_of_id: r["duplicate_of_id"] ?? null,
      status: r["status"] ?? "pending",
      applied_entity_type: r["applied_entity_type"] ?? null,
      applied_entity_id: r["applied_entity_id"] ?? null,
      decided_by: r["decided_by"] ?? null,
      decided_at: r["decided_at"] ?? null,
      created_at: String(r["created_at"] ?? ""),
      source_title: ev?.title ?? null,
      source_at: ev?.created_at ?? null,
      duplicate_title: dupTitle(r["duplicate_of_type"] ?? null, r["duplicate_of_id"] ?? null),
      owner_name: r["type"] === "owner" ? String(r["text"] ?? "") || null : null,
      intake_key: r["intake_key"] ?? null,
    };
  });

  const jobLines: TranscriptJob[] = [];
  for (const [attachmentId, j] of latestJobs) {
    const raw = String(j["status"]);
    if (raw !== "queued" && raw !== "running" && raw !== "done" && raw !== "failed") continue;
    const status: TranscriptJob["status"] = raw;
    const result = (j["result"] ?? {}) as Record<string, unknown>;
    const count = typeof result["proposals"] === "number" ? result["proposals"] : null;
    const unreadable = result["readable"] === false;
    let problem: string | null = null;
    if (status === "failed") {
      problem = (j["last_error"] as string | null) ?? "The reading did not finish.";
    } else if (status === "done" && unreadable) {
      problem =
        (result["problem"] as string | null) ??
        "That file could not be read as a meeting transcript.";
    } else if (status === "done" && count !== 0) {
      continue;
    }
    jobLines.push({
      attachment_id: attachmentId,
      title: files.get(attachmentId) ?? null,
      status,
      step: (j["step"] as string | null) ?? null,
      problem,
      proposals: status === "done" ? (count ?? 0) : null,
    });
  }

  return { jobs: jobLines, proposals };
}

/** How many transcript proposals await a decision, per implementation. */
export async function pendingProposalCounts(
  implementationIds: ReadonlyArray<string>,
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const ids = implementationIds.filter(Boolean);
  if (!ids.length) return out;
  const { data } = await db()
    .from("evidence_proposals")
    .select("implementation_id")
    .eq("status", "pending")
    .in("implementation_id", ids);
  for (const r of (data ?? []) as Array<{ implementation_id: string }>) {
    out.set(r.implementation_id, (out.get(r.implementation_id) ?? 0) + 1);
  }
  return out;
}

/* ----------------------------------------------------------------- apply */

type Actor = { profileId: string };

/** The table row as stored; the columns the decision paths read. */
type ProposalRecord = {
  id: string;
  implementation_id: string;
  type: EvidenceProposalRow["type"];
  title: string | null;
  text: string | null;
  quote: string | null;
  severity: EvidenceProposalRow["severity"];
  likelihood: EvidenceProposalRow["likelihood"];
  owner_team_member_id: string | null;
  proposed_date: string | null;
  intake_key: string | null;
  status: string;
  decided_by: string | null;
  decided_at: string | null;
};

async function pendingRow(id: string): Promise<ProposalRecord> {
  const { data: row } = await db()
    .from("evidence_proposals")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!row) throw new Error("That proposal no longer exists.");
  if (row.status !== "pending") throw new Error("That proposal was already decided.");
  return row as ProposalRecord;
}

/** A claim older than this belongs to a request that was cut off, and may be taken over. */
const CLAIM_TTL_MS = 2 * 60 * 1000;

/**
 * Take the row before anything is created from it: `decided_by` on a row
 * still pending says whose apply is in flight. Two reviewers clicking Apply
 * at the same moment both reach here; the one whose conditional update
 * matched goes on, the other is told. A claim left behind by a cut-off
 * request expires, conditional on the stale stamp it was found with.
 */
async function claimRow(id: string, actor: Actor): Promise<ProposalRecord> {
  const stamp = { decided_by: actor.profileId, decided_at: new Date().toISOString() };
  const attempt = async (narrow: (q: any) => any): Promise<ProposalRecord | null> => {
    const { data, error } = await narrow(
      db().from("evidence_proposals").update(stamp).eq("id", id).eq("status", "pending"),
    ).select("*");
    if (error) throw new Error(`Could not claim the proposal: ${error.message}`);
    const row = ((data ?? []) as ProposalRecord[])[0];
    return row ? { ...row, ...stamp } : null;
  };
  const claimed = await attempt((q) => q.is("decided_by", null));
  if (claimed) return claimed;

  const seen = await pendingRow(id);
  const since = seen.decided_at ? Date.parse(seen.decided_at) : Number.NaN;
  if (Number.isFinite(since) && Date.now() - since > CLAIM_TTL_MS) {
    const taken = await attempt((q) => q.eq("decided_at", seen.decided_at));
    if (taken) return taken;
  }
  throw new Error("Someone else is applying that proposal right now.");
}

/** Hand a claimed row back, pending and unclaimed, when nothing came of it. */
async function releaseRow(id: string, actor: Actor): Promise<void> {
  await db()
    .from("evidence_proposals")
    .update({ decided_by: null, decided_at: null })
    .eq("id", id)
    .eq("status", "pending")
    .eq("decided_by", actor.profileId);
}

async function decide(
  row: ProposalRecord,
  actor: Actor,
  patch: Record<string, unknown>,
  action: "evidence_proposal.applied" | "evidence_proposal.dismissed",
  payload: Record<string, unknown>,
): Promise<void> {
  // Conditional on the claim still being this actor's: a row taken over
  // meanwhile is not silently written twice.
  const { data, error } = await db()
    .from("evidence_proposals")
    .update({ ...patch, decided_by: actor.profileId, decided_at: new Date().toISOString() })
    .eq("id", row.id)
    .eq("status", "pending")
    .eq("decided_by", actor.profileId)
    .select("id");
  if (error) throw new Error(`Could not record the decision: ${error.message}`);
  if (((data ?? []) as unknown[]).length === 0) {
    throw new Error("That proposal was decided by someone else meanwhile.");
  }
  const { audit } = await import("./server/audit");
  await audit({
    actor_type: "user",
    actor_id: actor.profileId,
    action,
    entity_type: "evidence_proposal",
    entity_id: String(row.id),
    payload: { implementation_id: row.implementation_id, type: row.type, ...payload },
  });
}

export type ApplyOutcome = { ok: true; entityType: string; entityId: string | null };

/**
 * Apply one pending proposal: claim the row, create the entity through the
 * existing path, then mark the row applied with what was created. The write
 * paths are the same ones the forms call, so a risk from a transcript is a
 * risk like any other — stamped with the person who clicked, not the model.
 */
export async function applyProposal(
  id: string,
  picks: ProposalPicks,
  actor: Actor,
): Promise<ApplyOutcome> {
  const seen = await pendingRow(id);
  const implementationId = String(seen.implementation_id);
  const { data: impl } = await db()
    .from("implementations")
    .select("id,deal_id")
    .eq("id", implementationId)
    .maybeSingle();
  if (!impl) throw new Error("That implementation no longer exists.");
  const dealId = (impl.deal_id as string | null) ?? null;

  const plan = proposalApplyPlan(
    {
      type: seen.type,
      title: String(seen.title ?? ""),
      text: String(seen.text ?? ""),
      quote: seen.quote ?? null,
      severity: seen.severity ?? null,
      likelihood: seen.likelihood ?? null,
      owner_team_member_id: seen.owner_team_member_id ?? null,
      proposed_date: seen.proposed_date ?? null,
      intake_key: seen.intake_key ?? null,
    },
    picks,
    { planOwnsTarget: Boolean(dealId) },
  );
  if (plan.kind === "blocked") throw new Error(plan.reason);

  // Nothing is created until the row is this actor's.
  const row = await claimRow(id, actor);
  let created: { entityType: string; entityId: string | null };
  try {
    created = await createFromPlan(plan, { implementationId, dealId, actor });
  } catch (e) {
    await releaseRow(id, actor);
    throw e;
  }

  await decide(
    row,
    actor,
    {
      status: "applied",
      applied_entity_type: created.entityType,
      applied_entity_id: created.entityId,
    },
    "evidence_proposal.applied",
    { applied_entity_type: created.entityType, applied_entity_id: created.entityId },
  );
  return { ok: true, ...created };
}

/** The create itself, through the path the matching form would call. */
async function createFromPlan(
  plan: Exclude<ProposalApplyPlan, { kind: "blocked" }>,
  env: { implementationId: string; dealId: string | null; actor: Actor },
): Promise<{ entityType: string; entityId: string | null }> {
  const { implementationId, dealId, actor } = env;
  const hub = await import("./hub.server");
  const opts = { actorProfileId: actor.profileId };
  let entityType: string;
  let entityId: string | null = null;

  switch (plan.kind) {
    case "risk": {
      const { toRiskPatch } = await import("./delivery-input");
      const r = await hub.createRisk(
        implementationId,
        toRiskPatch({
          ...plan.input,
          impact: null,
          mitigation: null,
          identifiedAt: null,
          resolvedAt: null,
        }),
        opts,
      );
      entityType = "risk";
      entityId = r.id;
      break;
    }
    case "issue": {
      const { toIssuePatch } = await import("./delivery-input");
      const r = await hub.createIssue(
        implementationId,
        toIssuePatch({ ...plan.input, resolution: null, raisedAt: null, resolvedAt: null }),
        opts,
      );
      entityType = "issue";
      entityId = r.id;
      break;
    }
    case "decision": {
      const { toDecisionPatch } = await import("./delivery-input");
      const r = await hub.createDecision(
        implementationId,
        toDecisionPatch({ ...plan.input, description: null, decidedBy: null }),
        opts,
      );
      entityType = "decision";
      entityId = r.id;
      break;
    }
    case "note": {
      const { data: profile } = await db()
        .from("portal_profiles")
        .select("team_member_id")
        .eq("id", actor.profileId)
        .maybeSingle();
      await hub.createJournalEntry({
        implementationId,
        note: plan.input.note,
        authorId: (profile?.team_member_id as string | null) ?? null,
        links: null,
        attachmentUrl: null,
        attachmentName: null,
        kind: "note",
      });
      entityType = "journal_entry";
      break;
    }
    case "owner": {
      await hub.updateRecordField({
        implementationId,
        field: "owner_id",
        value: plan.ownerId,
        actorProfileId: actor.profileId,
      });
      entityType = "implementation";
      entityId = implementationId;
      break;
    }
    case "target_date": {
      if (plan.via === "plan" && dealId) {
        // The plan owns the date: the override on its last milestone is what
        // the page shows, and the next plan sync copies it onto the record.
        await moveLiveDate(dealId, plan.date, actor);
        entityType = "plan";
        entityId = dealId;
      } else {
        await hub.updateRecordField({
          implementationId,
          field: "target_launch_date",
          value: plan.date,
          actorProfileId: actor.profileId,
        });
        entityType = "implementation";
        entityId = implementationId;
      }
      break;
    }
    case "intake_suggestion": {
      if (!dealId) throw new Error("This implementation has no deal record to answer on.");
      await answerHandoff(dealId, plan.key, plan.value, plan.quote, actor);
      entityType = "handoff_answer";
      entityId = dealId;
      break;
    }
  }
  return { entityType, entityId };
}

export async function dismissProposal(id: string, actor: Actor): Promise<{ ok: true }> {
  const row = await claimRow(id, actor);
  await decide(row, actor, { status: "dismissed" }, "evidence_proposal.dismissed", {});
  return { ok: true };
}

/**
 * The plan's live date, moved the way the plan editor moves it: the
 * override on the plan's last milestone, saved through the same intake save
 * whose own sync carries it onto the record.
 */
async function moveLiveDate(dealId: string, date: string, actor: Actor): Promise<void> {
  const [{ data: deal }, { data: history }] = await Promise.all([
    db().from("portal_accounts").select("intake").eq("id", dealId).maybeSingle(),
    db().from("portal_stage_transitions").select("to_stage,occurred_at").eq("account_id", dealId),
  ]);
  if (!deal) throw new Error("The deal record no longer exists.");
  const { readIntake } = await import("./intake-answers");
  const { closeDateFor, timelineFor } = await import("./onboarding-plan");
  const { saveDealIntake } = await import("./presale.server");
  const intake = readIntake(deal.intake);
  const close = closeDateFor({
    intake,
    stageHistory: (history ?? []) as Array<{ to_stage: string; occurred_at: string }>,
    wonStageKey: "closed_won",
  });
  const t = timelineFor(intake, close.date);
  const live = t.milestones[t.milestones.length - 1];
  if (!live) throw new Error("The plan has no live date to move.");
  await saveDealIntake(actor.profileId, dealId, {
    timeline: {
      ...intake.timeline,
      overrides: { ...intake.timeline.overrides, [live.key]: date },
    },
  });
}

/**
 * A suggested handoff answer lands only on a blank or AI-filled question,
 * marked as the TIS's: a person's own answer is never replaced by a reading.
 */
async function answerHandoff(
  dealId: string,
  key: string,
  value: string,
  quote: string | null,
  actor: Actor,
): Promise<void> {
  const { data: deal } = await db()
    .from("portal_accounts")
    .select("intake")
    .eq("id", dealId)
    .maybeSingle();
  if (!deal) throw new Error("The deal record no longer exists.");
  const { readIntake } = await import("./intake-answers");
  const { answerSource, handoffPatch, handoffQuestion } = await import("./sales-handoff");
  const intake = readIntake(deal.intake);
  const source = answerSource(intake, key);
  if (source !== null && source !== "ai") {
    throw new Error(
      `${handoffQuestion(key)?.label ?? key} was answered by a person; the suggestion stands only as a note.`,
    );
  }
  const { saveDealIntake } = await import("./presale.server");
  await saveDealIntake(
    actor.profileId,
    dealId,
    handoffPatch(
      key,
      value,
      { source: "tis", by: actor.profileId, at: new Date().toISOString() },
      quote,
    ),
  );
}
