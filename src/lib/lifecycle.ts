export type LifecycleStageId =
  | "handoff"
  | "plan-internal"
  | "align-external"
  | "build"
  | "validate-iterate"
  | "launch"
  | "adopt"
  | "graduate-to-cs";

export type LifecyclePhase = "intake" | "delivery" | "value" | "steady-state";

/**
 * Descriptive role vocabulary for the lifecycle only. These are NOT ownership
 * fields and drive no assignment, permission or triage logic.
 */
export type LifecycleRole =
  "BDR" | "AE" | "SE" | "Implementation" | "Professional Services" | "Customer Success";

/** Marks the two organisational boundaries the journey must keep distinct. */
export type LifecycleBoundary = "sales-to-implementation" | "implementation-to-cs";

export type LifecycleStage = {
  id: LifecycleStageId;
  label: string;
  /** Short description of what "done" means at this stage. */
  intent: string;
  /** Coarse phase grouping used for visual banding and ownership derivation. */
  phase: LifecyclePhase;
  /** Descriptive: who leads this stage in the approved role model. */
  leads: LifecycleRole[];
  /** Descriptive: who supports without leading. */
  supports?: LifecycleRole[];
  /** Descriptive: conditional overlay engaged only when the work requires it. */
  overlay?: { role: LifecycleRole; condition: string };
  /** Descriptive: this stage is where accountability crosses an org boundary. */
  boundary?: LifecycleBoundary;
};

/**
 * The pre-sales steps, as documentation only.
 *
 * These were labelled "upstream — not owned by this app", which was true when
 * this file was written and stopped being true when the pre-sale pipeline
 * became a configured thing the application owns (`portal_pipeline_stages`).
 * The live list lives there and is edited under Admin -> Pre-sale stages; this
 * constant survives only as the descriptive note about who leads each step,
 * which the pipeline table does not carry.
 *
 * No ids in the post-sale lifecycle, no ownership, no behaviour.
 */
export const PRE_HANDOFF_CONTEXT: { label: string; note: string }[] = [
  { label: "Qualify", note: "Sales-led. Operating model not yet agreed." },
  { label: "Define the Process", note: "Sales-led. Operating model not yet agreed." },
  { label: "Technically Validate", note: "SE-led. Output becomes the agreed scope handed over." },
  {
    label: "Closed / Won",
    note: "Trigger, not a stage — an implementation record implies the deal is won.",
  },
];

/** Legacy pre-sales stage ids, kept readable on historical rows only. */
export const PRE_HANDOFF_STAGE_LABELS: Record<string, string> = {
  qualify: "Qualify",
  scoping: "Define the Process",
  "define-process": "Define the Process",
  "technically-validate": "Technically Validate",
};

export const LIFECYCLE_STAGES: LifecycleStage[] = [
  {
    id: "handoff",
    label: "Handoff",
    intent:
      "Sales-to-implementation transfer of context, promises and risks accepted by the Technical Implementation Specialist (TIS).",
    phase: "intake",

    leads: ["Implementation"],
    supports: ["AE", "SE"],
    boundary: "sales-to-implementation",
  },
  {
    id: "plan-internal",
    label: "Plan Internally",
    intent: "Internal implementation plan, owners and target dates committed.",
    phase: "delivery",
    leads: ["Implementation"],
  },
  {
    id: "align-external",
    label: "Align Externally",
    intent: "Customer stakeholders, success criteria and decision rights confirmed.",
    phase: "delivery",
    leads: ["Implementation"],
  },
  {
    id: "build",
    label: "Build",
    intent: "Configuration, integrations and data migration executed.",
    phase: "delivery",
    leads: ["Implementation"],
    overlay: {
      role: "Professional Services",
      condition: "Engaged only when build scope exceeds implementation capacity or capability.",
    },
  },
  {
    id: "validate-iterate",
    label: "Validate / Iterate",
    intent: "UAT and iteration loops closed; readiness sign-off complete.",
    phase: "delivery",
    leads: ["Implementation"],
  },
  {
    id: "launch",
    label: "Launch",
    intent: "Go-live executed and hypercare window opened.",
    phase: "delivery",
    leads: ["Implementation"],
  },
  {
    id: "adopt",
    label: "Adopt",
    intent:
      "Usage breadth and depth at the agreed bar, with success criteria showing measured movement.",
    phase: "value",
    leads: ["Implementation"],
  },
  {
    id: "graduate-to-cs",
    label: "Handover to Customer Success",
    intent:
      "Ready to hand over confirmed and accepted by Customer Success; account self-sufficient.",
    phase: "steady-state",
    leads: ["Implementation"],
    supports: ["Customer Success"],
    boundary: "implementation-to-cs",
  },
];

export const LIFECYCLE_BOUNDARY_LABEL: Record<LifecycleBoundary, string> = {
  "sales-to-implementation": "Sales / SE → Implementation",
  "implementation-to-cs": "Implementation → Customer Success",
};

export const LIFECYCLE_STAGE_MAP = Object.fromEntries(
  LIFECYCLE_STAGES.map((stage) => [stage.id, stage]),
) as Record<LifecycleStageId, LifecycleStage>;

/* ---------------------------------------------------------------------------
 * Configured overrides
 * ------------------------------------------------------------------------ */
/**
 * WHY THIS EXISTS. `portal_lifecycle_stages` (0031) makes stage labels and
 * intents editable, the `lifecycle_stage_config` flag is on, and the admin page
 * promises "Renaming a stage changes what people read". It did not: the rename
 * reached the database and nothing else, because every one of the twenty-two
 * places that renders a stage name reads the compiled-in map above.
 *
 * Threading configuration through twenty-two call sites would mean twenty-two
 * chances to miss one, and the one that was missed would be the bug. So the
 * REGISTRY is what changes, and every reader keeps calling `stageLabel`.
 *
 * SINGLE TENANT, AND THAT IS LOAD-BEARING. This is module state on the
 * server, shared by every in-flight request. That is only sound because there
 * is one organisation: every request would write identical values, so an
 * interleaved write cannot produce a wrong answer. If this application ever
 * serves a second org, this becomes a data leak between them and the overrides
 * must move into request context instead. Recorded here rather than discovered
 * later.
 */
export type StageOverride = {
  label: string;
  intent?: string | null;
  phase?: LifecyclePhase;
};

let stageOverrides: Record<string, StageOverride> = {};

/** Replace the configured labels wholesale. Called once per render pass. */
export function applyStageOverrides(
  rows: ReadonlyArray<{ key: string; label: string; intent?: string | null; phase?: string }>,
): void {
  const next: Record<string, StageOverride> = {};
  for (const row of rows ?? []) {
    if (!row?.key || typeof row.label !== "string" || row.label.trim() === "") continue;
    next[row.key] = {
      label: row.label,
      intent: row.intent ?? null,
      ...(row.phase ? { phase: row.phase as LifecyclePhase } : {}),
    };
  }
  stageOverrides = next;
}

/** Back to the compiled-in list. The test seam, and the flag-off state. */
export function resetStageOverrides(): void {
  stageOverrides = {};
}

/**
 * One stage, as it should be READ right now — configuration first, the
 * compiled-in definition behind it.
 *
 * The fallback matters: a stage somebody added in the admin screen has no
 * compiled definition at all, and a compiled stage nobody has edited has no
 * override. Both have to render.
 */
export function stageDefinition(id: string): (Partial<LifecycleStage> & { label: string }) | null {
  const base = (LIFECYCLE_STAGE_MAP as Record<string, LifecycleStage>)[id] ?? null;
  const over = stageOverrides[id];
  if (!base && !over) return null;
  if (!over) return base;
  return {
    ...(base ?? {}),
    label: over.label,
    ...(over.intent !== undefined && over.intent !== null ? { intent: over.intent } : {}),
    ...(over.phase ? { phase: over.phase } : {}),
  } as Partial<LifecycleStage> & { label: string };
}

/**
 * Legacy stage ids recorded before the lifecycle redesign. Kept permanently:
 * implementation_stage_history is append-only, so historical rows legitimately
 * carry the old vocabulary and aliasing is how we read them honestly.
 */
export const STAGE_ALIASES: Record<string, LifecycleStageId> = {
  plan: "plan-internal",
  align: "align-external",
  validate: "validate-iterate",
  "prove-value": "adopt",
  graduate: "graduate-to-cs",
  cs: "graduate-to-cs",
};
