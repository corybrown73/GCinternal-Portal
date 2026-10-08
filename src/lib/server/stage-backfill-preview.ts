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
 *   - A template is proposed only when the implementation's `journey_type`
 *     is actually recorded AND resolves to exactly one published template.
 *     A missing journey_type is never papered over by "there's only one
 *     published template anyway" — that is still a guess, not evidence.
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
 *   - Existing stage_instances rows are compared by their actual stage_key
 *     set against the candidate template's, not by row count: missing,
 *     extra, and duplicated keys are named, never averaged into "complete".
 *   - History that contradicts itself (more than one stage with no
 *     recorded exit, or a later stage entered before an earlier one) is
 *     named for manual review — never silently read as a clean match.
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
  stage_key: string;
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

/** How the existing stage_instances rows' stage_keys compare to the candidate template's. */
export type StageKeyMismatch = {
  /** In the template, not among the existing rows. */
  missing: string[];
  /** Among the existing rows, not in the template. */
  extra: string[];
  /** A stage_key with more than one existing row — a data problem on its own. */
  duplicates: string[];
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
  /** The raw stage_key of every existing stage_instances row for this implementation. */
  existingStageKeys: string[];
  /** The proposed template, or null when none is safely supported by the data. */
  templateMatch: TemplateMatch | null;
  /** Null only when there is no confirmed template to compare existing rows against. */
  mismatch: StageKeyMismatch | null;
  /** Contradictions found in implementation_stage_history itself — never silently absorbed. */
  historyConflicts: string[];
  /** "clean": no existing rows, a single supported template, no conflicts. "partial": existing rows that don't fully, exactly match. "needs_review": no safe match, or a conflict. */
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

function historyRowsFor(
  stageKey: string,
  implementationId: string,
  history: readonly StageHistoryRow[],
): StageHistoryRow[] {
  return history.filter((h) => {
    if (h.implementation_id !== implementationId) return false;
    const normalized = normalizeStageKey(h.stage);
    if (!normalized) return false;
    return resolveAgainstAliases(normalized).includes(stageKey);
  });
}

function previewStagesFor(
  stagesOfTemplate: readonly TemplateStageRow[],
  implementationId: string,
  currentStageKeys: string[],
  history: readonly StageHistoryRow[],
): StagePreviewRow[] {
  const currentPosition =
    stagesOfTemplate.find((s) => currentStageKeys.includes(s.stage_key))?.position ?? -1;

  return stagesOfTemplate.map((s) => {
    const rows = historyRowsFor(s.stage_key, implementationId, history);
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

/** Set comparison, never a count — a count cannot tell "complete" from "wrong rows". */
function compareExistingStageKeys(existing: string[], templateKeys: string[]): StageKeyMismatch {
  const missing = templateKeys.filter((k) => !existing.includes(k));
  const extra = [...new Set(existing)].filter((k) => !templateKeys.includes(k));
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const k of existing) {
    if (seen.has(k)) duplicates.add(k);
    seen.add(k);
  }
  return { missing, extra, duplicates: [...duplicates] };
}

/**
 * Contradictions inside implementation_stage_history itself, for the
 * matched template's stages: more than one stage recorded with no exit (the
 * implementation cannot be in two stages at once), or a later stage entered
 * before an earlier one (recorded out of the template's own order). Named,
 * not resolved — the timestamps that caused it are left exactly as recorded.
 */
function detectHistoryConflicts(
  stagesOfTemplate: readonly TemplateStageRow[],
  implementationId: string,
  history: readonly StageHistoryRow[],
): string[] {
  const grouped = stagesOfTemplate
    .map((s) => ({
      stageKey: s.stage_key,
      position: s.position,
      rows: historyRowsFor(s.stage_key, implementationId, history),
    }))
    .filter((g) => g.rows.length > 0);

  const conflicts: string[] = [];

  const stillOpen = grouped.filter((g) => g.rows.some((r) => r.exited_at === null));
  if (stillOpen.length > 1) {
    conflicts.push(
      `more than one stage has a history row with no recorded exit (${stillOpen
        .map((g) => g.stageKey)
        .join(", ")}) — an implementation cannot be in two stages at once`,
    );
  }

  for (let i = 0; i < grouped.length; i++) {
    for (let j = i + 1; j < grouped.length; j++) {
      const earlier = grouped[i]!;
      const later = grouped[j]!;
      if (later.position <= earlier.position) continue;
      const earlierMin = earlier.rows.map((r) => r.entered_at).sort()[0]!;
      const laterMin = later.rows.map((r) => r.entered_at).sort()[0]!;
      if (laterMin < earlierMin) {
        conflicts.push(
          `"${later.stageKey}" is recorded entered (${laterMin}) before "${earlier.stageKey}" ` +
            `(${earlierMin}) — out of the template's order`,
        );
      }
    }
  }

  return conflicts;
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
  const existingStageKeys = existingInstances
    .filter((r) => r.implementation_id === impl.id)
    .map((r) => r.stage_key);

  const rawStageValues = [impl.current_stage, ...implHistory.map((h) => h.stage)];
  const unsupportedStageKeys = [...new Set(rawStageValues)].filter(
    (raw) => normalizeStageKey(raw) === null,
  );

  const normalizedCurrentStage = normalizeStageKey(impl.current_stage);
  const reviewReasons: string[] = [];
  if (!normalizedCurrentStage) {
    reviewReasons.push(`current_stage "${impl.current_stage}" does not normalise to a stage key`);
  }

  let templateMatch: TemplateMatch | null = null;
  let stagePreview: StagePreviewRow[] = [];
  let mismatch: StageKeyMismatch | null = null;
  let historyConflicts: string[] = [];

  if (normalizedCurrentStage) {
    if (!impl.journey_type) {
      // No evidence to match against — never assigned by elimination, even
      // when exactly one published template exists.
      reviewReasons.push(
        "no journey_type recorded — matching a template without it would be a guess, not evidence",
      );
    } else {
      const candidates = templates.filter(
        (t) => t.status === "published" && t.journey_type === impl.journey_type,
      );
      if (candidates.length === 0) {
        reviewReasons.push(`no published template for journey_type "${impl.journey_type}"`);
      } else if (candidates.length > 1) {
        reviewReasons.push(
          `ambiguous: ${candidates.length} published templates match journey_type "${impl.journey_type}" ` +
            `(${candidates.map((c) => `${c.key} v${c.version}`).join(", ")})`,
        );
      } else {
        const only = candidates[0]!;
        const stageKeys = resolveAgainstAliases(normalizedCurrentStage);
        const stagesOfTemplate = templateStages
          .filter((s) => s.template_id === only.id)
          .slice()
          .sort((a, b) => a.position - b.position);
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
          stagePreview = previewStagesFor(stagesOfTemplate, impl.id, stageKeys, history);

          mismatch = compareExistingStageKeys(
            existingStageKeys,
            stagesOfTemplate.map((s) => s.stage_key),
          );
          // Zero existing rows is simply "not yet backfilled" (status "clean"
          // already says so) — not a mismatch worth its own reason. Only
          // surface this once there IS something recorded that doesn't fit.
          if (
            existingStageKeys.length > 0 &&
            (mismatch.missing.length || mismatch.extra.length || mismatch.duplicates.length)
          ) {
            reviewReasons.push(
              "existing stage_instances rows do not match the template's stage keys: " +
                [
                  mismatch.missing.length ? `missing ${mismatch.missing.join(", ")}` : null,
                  mismatch.extra.length ? `extra ${mismatch.extra.join(", ")}` : null,
                  mismatch.duplicates.length
                    ? `duplicated ${mismatch.duplicates.join(", ")}`
                    : null,
                ]
                  .filter((s): s is string => s !== null)
                  .join("; "),
            );
          }

          historyConflicts = detectHistoryConflicts(stagesOfTemplate, impl.id, history);
          reviewReasons.push(...historyConflicts);
        }
      }
    }
  }

  if (templateMatch === null && existingStageKeys.length > 0) {
    reviewReasons.push(
      `has ${existingStageKeys.length} existing stage_instances row(s) (${existingStageKeys.join(", ")}) ` +
        "that could not be checked against a confirmed template",
    );
  }

  const status: BackfillCandidate["status"] =
    templateMatch === null || historyConflicts.length > 0
      ? "needs_review"
      : existingStageKeys.length === 0
        ? "clean"
        : "partial";

  return {
    implementationId: impl.id,
    implementationName: impl.name,
    currentStage: impl.current_stage,
    normalizedCurrentStage,
    historyStageKeys: implHistory.map((h) => h.stage),
    unsupportedStageKeys,
    existingStageInstanceCount: existingStageKeys.length,
    existingStageKeys,
    templateMatch,
    mismatch,
    historyConflicts,
    status,
    reviewReasons,
    stagePreview,
  };
}

/**
 * Every implementation that is not already fully, cleanly instantiated —
 * compared by the actual set of stage_keys, never by a row count — or that
 * has a history conflict worth a human's attention even if the keys do
 * line up. An implementation whose existing rows exactly match the
 * template's stage keys, with no conflict, is left out: there is nothing
 * to preview for it.
 */
export function previewStageBackfill(input: {
  implementations: readonly ImplementationRow[];
  history: readonly StageHistoryRow[];
  existingInstances: readonly ExistingStageInstanceRow[];
  templates: readonly PublishedTemplateRow[];
  templateStages: readonly TemplateStageRow[];
}): BackfillCandidate[] {
  return input.implementations
    .map((impl) =>
      previewOneImplementation(
        impl,
        input.history,
        input.existingInstances,
        input.templates,
        input.templateStages,
      ),
    )
    .filter((c) => {
      if (c.historyConflicts.length > 0) return true;
      if (!c.mismatch) return true;
      const fullyPopulated =
        c.mismatch.missing.length === 0 &&
        c.mismatch.extra.length === 0 &&
        c.mismatch.duplicates.length === 0 &&
        c.existingStageKeys.length > 0;
      return !fullyPopulated;
    });
}
