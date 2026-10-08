import { STAGE_ALIASES } from "@/lib/lifecycle";

/**
 * A read-only PREVIEW of attaching journey `stage_instances` to legacy
 * implementations that have none (or only some) — never a write. It answers
 * the same question migration 0015 answered once, by hand, for the
 * "new-logo" template: which implementations would get which stages, from
 * which evidence, and which ones it would have to skip rather than guess.
 *
 * It mirrors 0015's own rules on purpose, generalised to any published
 * template rather than hardcoded to "new-logo":
 *   - A stage is proposed only when the implementation's `journey_type`
 *     resolves to exactly one published template (or there is exactly one
 *     published template at all) — never a guess among several.
 *   - `current_stage` must normalise (via the same trim/lowercase/dash and
 *     STAGE_ALIASES 0015 used) to a stage_key the candidate template
 *     actually has. If it does not, the match is withdrawn — "Needs review"
 *     beats a wrong plan.
 *   - entered_at/exited_at are read from implementation_stage_history only.
 *     A stage with no matching history row gets null dates and is marked
 *     'backfill_inferred'; one with a row is 'backfill_observed' — the exact
 *     vocabulary stage_instances.provenance already uses, because a real
 *     backfill would write this is exactly that value.
 *   - exited_at is never set for the current or a later stage, and never
 *     invented from entered_at — an open stage stays open.
 */

export type ImplementationRow = {
  id: string;
  name: string;
  current_stage: string;
  journey_type: string | null;
};

export type StageHistoryRow = {
  implementation_id: string;
  stage: string;
  entered_at: string;
  exited_at: string | null;
};

export type ExistingStageInstanceRow = {
  implementation_id: string;
};

export type PublishedTemplateRow = {
  id: string;
  key: string;
  version: number;
  name: string;
  journey_type: string | null;
  status: string;
};

export type TemplateStageRow = {
  template_id: string;
  stage_key: string;
  name: string;
  position: number;
};

export type StagePreviewRow = {
  stageKey: string;
  name: string;
  position: number;
  status: "pending" | "active" | "done";
  /** Matches stage_instances.provenance's own vocabulary — never 'live' here. */
  provenance: "backfill_observed" | "backfill_inferred";
  /** From implementation_stage_history only. Null when none was recorded — never invented. */
  enteredAt: string | null;
  /** Never set for the current or a later stage, and never derived from enteredAt. */
  exitedAt: string | null;
  historyRowCount: number;
};

export type TemplateMatch = {
  templateId: string;
  templateKey: string;
  templateVersion: number;
  templateName: string;
};

export type BackfillCandidate = {
  implementationId: string;
  implementationName: string;
  currentStage: string;
  normalizedCurrentStage: string | null;
  historyStageKeys: string[];
  /** Stage values in current_stage or history that don't normalise to anything known. */
  unsupportedStageKeys: string[];
  existingStageInstanceCount: number;
  /** The proposed template, or null when none is safely supported by the data. */
  templateMatch: TemplateMatch | null;
  /** "clean": no existing rows, a single supported template. "partial": some rows already exist. "needs_review": no safe match. */
  status: "clean" | "partial" | "needs_review";
  /** Why, in order found — empty only when status is "clean". */
  reviewReasons: string[];
  /** Populated only when templateMatch is non-null. */
  stagePreview: StagePreviewRow[];
};

/** The same normalise-then-alias 0015 used, so a reader never sees a second rule for the same text. */
export function normalizeStageKey(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const key = raw.trim().toLowerCase().replace(/_/g, "-");
  return key || null;
}

/** `normalizeStageKey`, then the known legacy spellings — never a template-specific guess. */
function resolveAgainstAliases(normalized: string): string[] {
  const aliased = STAGE_ALIASES[normalized];
  return aliased ? [normalized, aliased] : [normalized];
}

function candidateTemplatesFor(
  impl: ImplementationRow,
  templates: readonly PublishedTemplateRow[],
): PublishedTemplateRow[] {
  const published = templates.filter((t) => t.status === "published");
  // No recorded journey_type at all: fall back to "every published
  // template" so a lone published template still counts as unambiguous.
  // But a journey_type that IS recorded and matches nothing published is
  // itself the finding — never silently widened to "any template".
  return impl.journey_type
    ? published.filter((t) => t.journey_type === impl.journey_type)
    : published;
}

function previewStagesFor(
  template: PublishedTemplateRow,
  implementationId: string,
  currentStageKeys: string[],
  history: readonly StageHistoryRow[],
  templateStages: readonly TemplateStageRow[],
): StagePreviewRow[] {
  const stages = templateStages
    .filter((s) => s.template_id === template.id)
    .slice()
    .sort((a, b) => a.position - b.position);
  const currentPosition =
    stages.find((s) => currentStageKeys.includes(s.stage_key))?.position ?? -1;

  const historyFor = (stageKey: string) =>
    history.filter((h) => {
      if (h.implementation_id !== implementationId) return false;
      const normalized = normalizeStageKey(h.stage);
      if (!normalized) return false;
      return resolveAgainstAliases(normalized).includes(stageKey);
    });

  return stages.map((s) => {
    const rows = historyFor(s.stage_key);
    const enteredAt = rows.length
      ? rows.map((r) => r.entered_at).reduce((min, d) => (d < min ? d : min))
      : null;
    const exitedCandidates = rows.map((r) => r.exited_at).filter((d): d is string => d !== null);
    const status: StagePreviewRow["status"] =
      s.position < currentPosition ? "done" : s.position === currentPosition ? "active" : "pending";
    return {
      stageKey: s.stage_key,
      name: s.name,
      position: s.position,
      status,
      provenance: rows.length > 0 ? "backfill_observed" : "backfill_inferred",
      enteredAt,
      // Never invented, and never set for a stage that cannot have exited yet.
      exitedAt:
        status === "done" && exitedCandidates.length ? exitedCandidates.sort().pop()! : null,
      historyRowCount: rows.length,
    };
  });
}

/**
 * The preview for one implementation. Pure: every input is already read
 * from the database by the caller — nothing here queries or writes anything.
 */
export function previewOneImplementation(
  impl: ImplementationRow,
  history: readonly StageHistoryRow[],
  existingInstances: readonly ExistingStageInstanceRow[],
  templates: readonly PublishedTemplateRow[],
  templateStages: readonly TemplateStageRow[],
): BackfillCandidate {
  const implHistory = history.filter((h) => h.implementation_id === impl.id);
  const existingCount = existingInstances.filter((r) => r.implementation_id === impl.id).length;

  const rawStageValues = [impl.current_stage, ...implHistory.map((h) => h.stage)];
  const unsupportedStageKeys = [...new Set(rawStageValues)].filter(
    (raw) => normalizeStageKey(raw) === null,
  );

  const normalizedCurrentStage = normalizeStageKey(impl.current_stage);
  const reviewReasons: string[] = [];
  if (!normalizedCurrentStage) {
    reviewReasons.push(`current_stage "${impl.current_stage}" does not normalise to a stage key`);
  }

  const candidates = candidateTemplatesFor(impl, templates);
  let templateMatch: TemplateMatch | null = null;
  let stagePreview: StagePreviewRow[] = [];

  if (normalizedCurrentStage) {
    if (candidates.length === 0) {
      reviewReasons.push(
        impl.journey_type
          ? `no published template for journey_type "${impl.journey_type}"`
          : "no journey_type recorded, and no published template exists",
      );
    } else if (candidates.length > 1) {
      reviewReasons.push(
        `ambiguous: ${candidates.length} published templates match ` +
          (impl.journey_type
            ? `journey_type "${impl.journey_type}"`
            : "with no journey_type to narrow by") +
          ` (${candidates.map((c) => `${c.key} v${c.version}`).join(", ")})`,
      );
    } else {
      const only = candidates[0]!;
      const stageKeys = resolveAgainstAliases(normalizedCurrentStage);
      const stagesOfTemplate = templateStages.filter((s) => s.template_id === only.id);
      const hasStage = stagesOfTemplate.some((s) => stageKeys.includes(s.stage_key));
      if (!hasStage) {
        reviewReasons.push(
          `current_stage "${impl.current_stage}" (normalised "${normalizedCurrentStage}") is not a stage in ` +
            `template "${only.key}" v${only.version}`,
        );
      } else {
        templateMatch = {
          templateId: only.id,
          templateKey: only.key,
          templateVersion: only.version,
          templateName: only.name,
        };
        stagePreview = previewStagesFor(only, impl.id, stageKeys, history, templateStages);
      }
    }
  }

  if (existingCount > 0) {
    reviewReasons.push(
      `already has ${existingCount} existing stage_instances row(s) — not a clean, zero-row backfill`,
    );
  }

  const status: BackfillCandidate["status"] =
    templateMatch === null ? "needs_review" : existingCount > 0 ? "partial" : "clean";

  return {
    implementationId: impl.id,
    implementationName: impl.name,
    currentStage: impl.current_stage,
    normalizedCurrentStage,
    historyStageKeys: implHistory.map((h) => h.stage),
    unsupportedStageKeys,
    existingStageInstanceCount: existingCount,
    templateMatch,
    status,
    reviewReasons,
    stagePreview,
  };
}

/**
 * Every implementation that is not already fully, cleanly instantiated:
 * zero stage_instances (the main "legacy, never backfilled" case) or some
 * but not a clean match. An implementation already carrying a full,
 * untouched set is left out — there is nothing to preview for it.
 */
export function previewStageBackfill(input: {
  implementations: readonly ImplementationRow[];
  history: readonly StageHistoryRow[];
  existingInstances: readonly ExistingStageInstanceRow[];
  templates: readonly PublishedTemplateRow[];
  templateStages: readonly TemplateStageRow[];
}): BackfillCandidate[] {
  return (
    input.implementations
      .map((impl) =>
        previewOneImplementation(
          impl,
          input.history,
          input.existingInstances,
          input.templates,
          input.templateStages,
        ),
      )
      // Already fully, cleanly instantiated: a confident template match whose
      // every stage already has a row. Nothing to preview for it.
      .filter((c) => !(c.templateMatch && c.existingStageInstanceCount >= c.stagePreview.length))
  );
}
