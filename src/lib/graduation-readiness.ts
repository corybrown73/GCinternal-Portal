import type { Customer360 } from "./hub-types";
import { fmtDate, isOverdue, stageIndex, stageLabel } from "./hub-format";
import {
  adoptionAreaLevel,
  adoptionSummary,
  latestAdoptionObservation,
  openItems,
  proveValueState,
  severityRank,
} from "./customer360-derive";

/**
 * Graduation readiness is a READ-ONLY managerial view answering "are we actually
 * ready to hand this customer to CS?". It is deliberately:
 *  - not a gate (it never blocks or moves a stage),
 *  - not a score (no composite number, no percentages),
 *  - independent of deriveHealth / Home triage / waitingOn / Prove Value state
 *    / adoption state, all of which stay exactly as they are.
 * Every state carries its own reason so the UI never says "not ready" mutely.
 */
export type ReadinessState = "ready" | "needs_attention" | "not_applicable";

export type ReadinessAreaId = "delivery" | "value" | "adoption" | "open_work" | "cs_handoff";

export type ReadinessArea = {
  id: ReadinessAreaId;
  label: string;
  state: ReadinessState;
  /** Concise explanation — always populated, including for "ready". */
  reason: string;
  /** Optional Customer 360 tab this area is evidenced in. */
  tab?: string;
};

export const READINESS_STATE_LABEL: Record<ReadinessState, string> = {
  ready: "Ready",
  needs_attention: "Attention",
  not_applicable: "N/A",
};

type ReadinessImpl = {
  current_stage: string;
  actual_launch_date: string | null;
  target_launch_date: string | null;
};

const idx = (stage: string) => stageIndex(stage);

const BLOCKING_SEVERITY = 1; // critical or high

export function graduationReadiness(record: Customer360, impl: ReadinessImpl): ReadinessArea[] {
  const current = idx(impl.current_stage);
  const launchIdx = idx("launch");
  const alignIdx = idx("align-external");
  const validateIdx = idx("validate-iterate");
  const adoptIdx = idx("adopt");
  const graduateIdx = idx("graduate-to-cs");
  const open = openItems(record);

  /* ---------------- 1. Delivery ---------------- */
  const deliveryBlockers = [...open.escalations, ...open.issues].filter(
    (r: any) => severityRank(r.severity) <= BLOCKING_SEVERITY,
  );
  let delivery: ReadinessArea;
  if (current < 0) {
    delivery = {
      id: "delivery",
      label: "Delivery",
      state: "needs_attention",
      reason: `Current stage "${impl.current_stage}" is not a recognised lifecycle stage`,
    };
  } else if (current < launchIdx) {
    delivery = {
      id: "delivery",
      label: "Delivery",
      state: "needs_attention",
      reason: `Still at ${stageLabel(impl.current_stage)} — delivery has not reached Launch yet`,
      tab: "journey",
    };
  } else if (!impl.actual_launch_date) {
    delivery = {
      id: "delivery",
      label: "Delivery",
      state: "needs_attention",
      reason: `Stage is ${stageLabel(impl.current_stage)} but no actual launch date is recorded`,
      tab: "journey",
    };
  } else if (deliveryBlockers.length) {
    const top = [...deliveryBlockers].sort(
      (a: any, b: any) => severityRank(a.severity) - severityRank(b.severity),
    )[0] as any;
    delivery = {
      id: "delivery",
      label: "Delivery",
      state: "needs_attention",
      reason: `${deliveryBlockers.length} unresolved ${top.severity} blocker(s) — ${top.title}`,
      tab: "risks",
    };
  } else {
    delivery = {
      id: "delivery",
      label: "Delivery",
      state: "ready",
      reason: `Launched ${fmtDate(impl.actual_launch_date)} with no critical or high blockers open`,
      tab: "journey",
    };
  }

  /* ---------------- 2. Prove Value ---------------- */
  const criteria = record.success_criteria ?? [];
  let value: ReadinessArea;
  if (!criteria.length) {
    value =
      current >= alignIdx
        ? {
            id: "value",
            label: "Value",
            state: "needs_attention",
            reason: `No success criteria recorded, and the implementation is already at ${stageLabel(
              impl.current_stage,
            )} — value cannot be proven`,
            tab: "overview",
          }
        : {
            id: "value",
            label: "Value",
            state: "not_applicable",
            reason: "Success criteria are agreed at Align Externally — not expected yet",
            tab: "overview",
          };
  } else {
    const states = criteria.map((c) => ({
      description: (c.description ?? "").trim() || "Untitled success criterion",
      state: proveValueState(c, c.observations ?? [], c.confirmations ?? []),
    }));
    const notMet = states.filter((s) => s.state === "not_met");
    const noBaseline = states.filter((s) => s.state === "not_baselined");
    const noObs = states.filter((s) => s.state === "not_measured");
    const unconfirmed = states.filter((s) => s.state === "measured_unconfirmed");
    const confirmed = states.filter((s) => s.state === "customer_confirmed");

    if (notMet.length) {
      value = {
        id: "value",
        label: "Value",
        state: "needs_attention",
        reason: `${notMet.length} criterion(s) latest observation says target not met — ${notMet[0]!.description}`,
        tab: "overview",
      };
    } else if (noBaseline.length) {
      value = {
        id: "value",
        label: "Value",
        state: "needs_attention",
        reason: `${noBaseline.length} criterion(s) not baselined — ${noBaseline[0]!.description}`,
        tab: "overview",
      };
    } else if (noObs.length) {
      value = {
        id: "value",
        label: "Value",
        state: "needs_attention",
        reason: `${noObs.length} criterion(s) baselined but never measured — ${noObs[0]!.description}`,
        tab: "overview",
      };
    } else if (unconfirmed.length) {
      // Customer confirmation is only expected once value should be provable.
      value =
        current >= validateIdx
          ? {
              id: "value",
              label: "Value",
              state: "needs_attention",
              reason: `${unconfirmed.length} measured criterion(s) awaiting customer confirmation — ${unconfirmed[0]!.description}`,
              tab: "overview",
            }
          : {
              id: "value",
              label: "Value",
              state: "not_applicable",
              reason: `Measured, and confirmation is not expected before Validate / Iterate (currently ${stageLabel(
                impl.current_stage,
              )})`,
              tab: "overview",
            };
    } else {
      value = {
        id: "value",
        label: "Value",
        state: "ready",
        reason: `All ${confirmed.length} criterion(s) baselined, measured and customer-confirmed`,
        tab: "overview",
      };
    }
  }

  /* ---------------- 3. Adoption (behavioural, never inferred from value) ---------------- */
  const areas = record.adoption ?? [];
  const summary = adoptionSummary(areas);
  let adoption: ReadinessArea;
  if (!areas.length) {
    adoption =
      current >= adoptIdx
        ? {
            id: "adoption",
            label: "Adoption",
            state: "needs_attention",
            reason: `No intended adoption areas recorded, and the implementation is already at ${stageLabel(
              impl.current_stage,
            )}`,
            tab: "overview",
          }
        : {
            id: "adoption",
            label: "Adoption",
            state: "not_applicable",
            reason: "Adoption areas are expected from the Adopt stage — none recorded yet",
            tab: "overview",
          };
  } else {
    const unobserved = areas.filter((a) => adoptionAreaLevel(a) === "unknown");
    const atRisk = areas.filter((a) => adoptionAreaLevel(a) === "at_risk");
    const notEstablished = areas.filter(
      (a) => !["established", "unknown"].includes(adoptionAreaLevel(a)),
    );
    const workarounds = summary?.workarounds ?? [];

    if (atRisk.length) {
      adoption = {
        id: "adoption",
        label: "Adoption",
        state: "needs_attention",
        reason: `${atRisk.length} adoption area(s) at risk — ${atRisk[0]!.name}`,
        tab: "overview",
      };
    } else if (unobserved.length) {
      adoption = {
        id: "adoption",
        label: "Adoption",
        state: "needs_attention",
        reason: `${unobserved.length} of ${areas.length} adoption area(s) have no observation recorded — ${unobserved[0]!.name}`,
        tab: "overview",
      };
    } else if (current >= graduateIdx && notEstablished.length) {
      adoption = {
        id: "adoption",
        label: "Adoption",
        state: "needs_attention",
        reason: `At ${stageLabel(impl.current_stage)}, ${notEstablished.length} area(s) are still not established — ${notEstablished[0]!.name}`,
        tab: "overview",
      };
    } else if (workarounds.length) {
      adoption = {
        id: "adoption",
        label: "Adoption",
        state: "needs_attention",
        reason: `Workaround still in use in ${workarounds.length} area(s) — ${workarounds[0]!.name}`,
        tab: "overview",
      };
    } else {
      const latestDate = areas
        .map((a) => latestAdoptionObservation(a.observations)?.observed_at ?? null)
        .filter(Boolean)
        .sort()
        .pop();
      adoption = {
        id: "adoption",
        label: "Adoption",
        state: "ready",
        reason: `All ${areas.length} area(s) observed in use with no workarounds${
          latestDate ? `, latest observation ${fmtDate(latestDate)}` : ""
        }`,
        tab: "overview",
      };
    }
  }

  /* ---------------- 4. Open work ---------------- */
  const overdueCommitments = open.commitments.filter((c: any) => isOverdue(c.due_date));
  const openWorkCount =
    open.escalations.length + open.issues.length + open.risks.length + overdueCommitments.length;
  let openWork: ReadinessArea;
  if (open.escalations.length) {
    openWork = {
      id: "open_work",
      label: "Open work",
      state: "needs_attention",
      reason: `${open.escalations.length} open escalation(s) still with Implementation — ${(open.escalations[0] as any).title}`,
      tab: "risks",
    };
  } else if (open.issues.length) {
    openWork = {
      id: "open_work",
      label: "Open work",
      state: "needs_attention",
      reason: `${open.issues.length} open issue(s) still with Implementation — ${(open.issues[0] as any).title}`,
      tab: "risks",
    };
  } else if (overdueCommitments.length) {
    const c: any = overdueCommitments[0];
    openWork = {
      id: "open_work",
      label: "Open work",
      state: "needs_attention",
      reason: `${overdueCommitments.length} overdue commitment(s) — ${c.description} (due ${fmtDate(c.due_date)})`,
      tab: "overview",
    };
  } else if (open.risks.length) {
    openWork = {
      id: "open_work",
      label: "Open work",
      state: "needs_attention",
      reason: `${open.risks.length} open risk(s) to transfer or close — ${(open.risks[0] as any).title}`,
      tab: "risks",
    };
  } else {
    openWork = {
      id: "open_work",
      label: "Open work",
      state: "ready",
      reason: `No open escalations, issues, risks or overdue commitments (${openWorkCount} open)`,
      tab: "risks",
    };
  }

  /* ---------------- 5. CS handoff record completeness ONLY ----------------
   * This area describes whether the CS handoff record itself is complete
   * (handoff date, CS owner, summary). It deliberately says nothing about
   * whether Value or Adoption were satisfied — the existence of a graduations
   * row is not evidence of either. */
  const graduation = record.graduation ?? null;
  const handoff = record.cs_handoff ?? null;
  const csOwner = handoff?.cs_owner_name ?? graduation?.cs_owner_name ?? null;
  const csSummary = (handoff?.summary ?? graduation?.exit_criteria_summary ?? "").trim();
  const csDate = handoff?.handoff_date ?? graduation?.graduated_at ?? null;
  let csHandoff: ReadinessArea;
  if (!graduation && !handoff) {
    csHandoff = {
      id: "cs_handoff",
      label: "Handover record",
      state: "needs_attention",
      reason: "No handover or graduation record exists yet",
      tab: "journey",
    };
  } else {
    const missing = [
      csDate ? null : "handover date",
      csOwner ? null : "CS owner",
      csSummary ? null : "handover summary",
    ].filter(Boolean) as string[];
    csHandoff = missing.length
      ? {
          id: "cs_handoff",
          label: "Handover record",
          state: "needs_attention",
          reason: `Handover record is incomplete — missing ${missing.join(", ")}`,
          tab: "journey",
        }
      : {
          id: "cs_handoff",
          label: "Handover record",
          state: "ready",
          reason: `Handover record is complete (${fmtDate(csDate)}, CS owner ${csOwner}). Record completeness only — it does not evidence Value or Adoption.`,
          tab: "journey",
        };
  }

  return [delivery, value, adoption, openWork, csHandoff];
}

/* ============================================================================
 * Verified-vs-narrative split for the graduation / CS handoff information.
 * Purely derived from records already loaded — no schema, data or workflow.
 * ========================================================================== */

export type VerifiedFact = { label: string; value: string };
export type NarrativeClaim = { label: string; value: string; source: string };

export type GraduationEvidence = {
  hasRecord: boolean;
  /** Facts the system can substantiate from structured records. */
  verified: VerifiedFact[];
  /** Free-text claims, preserved verbatim, never treated as verified. */
  narrative: NarrativeClaim[];
  /** Present when narrative claims exist without corroborating structured records. */
  corroboration: string | null;
};

export function graduationEvidence(
  record: Customer360,
  impl: { actual_launch_date: string | null },
): GraduationEvidence {
  const graduation = record.graduation ?? null;
  const handoff = record.cs_handoff ?? null;
  const criteria = record.success_criteria ?? [];
  const observations = criteria.reduce((n, c) => n + (c.observations?.length ?? 0), 0);
  const confirmations = criteria.reduce((n, c) => n + (c.confirmations?.length ?? 0), 0);
  const areas = record.adoption ?? [];
  const adoptionObs = areas.reduce((n, a) => n + (a.observations?.length ?? 0), 0);
  const evidenceCount = (record.evidence ?? []).length;
  const approvalCount = (record.approvals ?? []).length;

  const verified: VerifiedFact[] = [
    {
      label: "Graduated",
      value: graduation?.graduated_at ? fmtDate(graduation.graduated_at) : "—",
    },
    { label: "Handover date", value: handoff?.handoff_date ? fmtDate(handoff.handoff_date) : "—" },
    {
      label: "CS owner",
      value: handoff?.cs_owner_name ?? graduation?.cs_owner_name ?? "—",
    },
    {
      label: "Actual launch",
      value: impl.actual_launch_date ? fmtDate(impl.actual_launch_date) : "—",
    },
    { label: "Success criteria", value: String(criteria.length) },
    { label: "Observations", value: String(observations) },
    { label: "Customer confirmations", value: String(confirmations) },
    { label: "Adoption areas", value: String(areas.length) },
    { label: "Adoption observations", value: String(adoptionObs) },
    { label: "Evidence items", value: String(evidenceCount) },
    { label: "Approvals", value: String(approvalCount) },
  ];

  const narrative: NarrativeClaim[] = [];
  const push = (label: string, value: string | null | undefined, source: string) => {
    if ((value ?? "").trim()) narrative.push({ label, value: value!, source });
  };
  push("Exit criteria summary", graduation?.exit_criteria_summary, "graduation record");
  push("Health at graduation", graduation?.health_at_graduation, "graduation record");
  push("Graduation notes", graduation?.notes, "graduation record");
  push("Handover summary", handoff?.summary, "handover record");
  push("Open items at handover", handoff?.open_items, "handover record");
  push("Account context", handoff?.account_context, "handover record");

  let corroboration: string | null = null;
  if (narrative.length) {
    const absent: string[] = [];
    if (!criteria.length) absent.push("no success criteria");
    else if (!observations) absent.push("no observations");
    if (criteria.length && !confirmations) absent.push("no customer confirmations");
    if (!areas.length) absent.push("no adoption areas");
    else if (!adoptionObs) absent.push("no adoption observations");
    if (absent.length) {
      corroboration = `This narrative is not corroborated by structured records: ${absent.join(
        ", ",
      )} exist for this implementation. Read the text above as an assertion, not as verified evidence.`;
    }
  }

  return {
    hasRecord: Boolean(graduation || handoff),
    verified,
    narrative,
    corroboration,
  };
}

/** Honest one-line summary. Counts only — never a score. */
export function graduationReadinessSummary(areas: ReadinessArea[]) {
  const attention = areas.filter((a) => a.state === "needs_attention");
  const ready = areas.filter((a) => a.state === "ready");
  const na = areas.filter((a) => a.state === "not_applicable");
  return {
    attention: attention.length,
    ready: ready.length,
    not_applicable: na.length,
    line: attention.length
      ? `${attention.length} area(s) need attention before handover: ${attention
          .map((a) => a.label)
          .join(", ")}`
      : `All assessed areas ready${na.length ? ` (${na.length} not applicable yet)` : ""}`,
  };
}
