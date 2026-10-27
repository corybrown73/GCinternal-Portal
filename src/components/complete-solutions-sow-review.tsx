import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import {
  saveSuggestedSolutions,
  suggestSolutionsFromSow,
} from "@/lib/complete-solutions.functions";
import {
  CATEGORY_LABEL,
  COMPONENT_CATEGORIES,
  INTEGRATION_TYPE_LABEL,
  INTEGRATION_TYPES,
  PRIORITIES,
  PRIORITY_LABEL,
  SOLUTION_SCOPE_LABEL,
  SOLUTION_SCOPES,
  type ComponentCategory,
  type IntegrationType,
  type Priority,
  type SolutionScope,
} from "@/lib/complete-solutions";
import type { SowSuggestion } from "@/lib/complete-solutions-sow.server";
import type { ReviewedSolution } from "@/lib/complete-solutions-sow";

const FIELD =
  "rounded-sm border border-input bg-background px-2 py-1 text-[12px] text-foreground outline-none focus:ring-1 focus:ring-ring disabled:opacity-60";
const BUTTON =
  "rounded-sm border border-border px-2.5 py-1 text-[12px] hover:bg-muted disabled:opacity-50";
const PRIMARY =
  "rounded-sm border border-primary/40 bg-primary/5 px-2.5 py-1 text-[12px] font-medium text-primary hover:bg-primary/10 disabled:opacity-50";

/** A reviewed row keeps an "include" flag so the TIS can drop a suggestion before saving. */
type DraftComponent = ReviewedSolution["components"][number] & { include: boolean };
type Draft = Omit<ReviewedSolution, "components"> & {
  include: boolean;
  components: DraftComponent[];
};

function toDraft(solutions: ReviewedSolution[]): Draft[] {
  return solutions.map((s) => ({
    ...s,
    include: true,
    components: s.components.map((c) => ({ ...c, include: true })),
  }));
}

/**
 * Reads the signed SOW and shows what it appears to contain, for the TIS to
 * review, edit and confirm. Nothing is saved until "Save the confirmed set".
 */
export function SowSolutionsReview({ implementationId }: { implementationId: string }) {
  const [open, setOpen] = useState(false);
  const [sowName, setSowName] = useState<string | null>(null);
  const [gaps, setGaps] = useState<string[]>([]);
  const [draft, setDraft] = useState<Draft[] | null>(null);
  const [saved, setSaved] = useState<string[] | null>(null);
  const qc = useQueryClient();
  const readFn = useServerFn(suggestSolutionsFromSow);
  const saveFn = useServerFn(saveSuggestedSolutions);

  const read = useMutation({
    mutationFn: () => readFn({ data: { implementationId } }),
    onSuccess: (out: SowSuggestion) => {
      setSowName(out.sowName);
      setGaps(out.gaps);
      setDraft(toDraft(out.solutions));
      setSaved(null);
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const kept = (draft ?? [])
        .filter((s) => s.include)
        .map((s) => {
          const components = s.components.filter((c) => c.include);
          const names = new Set(components.map((c) => c.name.toLowerCase()));
          return {
            title: s.title,
            scope: s.scope,
            startCondition: s.startCondition,
            estimateWeeks: s.estimateWeeks,
            sowQuote: s.sowQuote,
            suggestedTarget: s.suggestedTarget,
            targetReason: s.targetReason,
            components: components.map((c) => ({
              category: c.category,
              integrationType: c.category === "integrations" ? c.integrationType : null,
              name: c.name,
              priority: c.priority,
              // A dependency on a component the TIS dropped is not kept.
              dependsOn: c.dependsOn.filter((d) => names.has(d.toLowerCase())),
              critical: c.critical,
              startCondition: c.startCondition,
              estimateWeeks: c.estimateWeeks,
              sowQuote: c.sowQuote,
              suggestedTarget: c.suggestedTarget,
            })),
          };
        });
      return saveFn({ data: { implementationId, sowName, solutions: kept } });
    },
    onSuccess: (result) => {
      const lines = [
        ...result.created.map(
          (c) =>
            `Added ${c.title}: ${c.components} component${c.components === 1 ? "" : "s"}, ${c.dependencies} dependenc${c.dependencies === 1 ? "y" : "ies"}.`,
        ),
        ...result.skipped.map((s) => `Not added — ${s.title}: ${s.reason}`),
        ...result.problems,
      ];
      setSaved(lines.length ? lines : ["Nothing to add: every suggestion was already recorded."]);
      setDraft(null);
      void qc.invalidateQueries({ queryKey: ["complete-solutions", implementationId] });
    },
  });

  const patch = (i: number, change: Partial<Draft>) =>
    setDraft((d) => (d ? d.map((s, j) => (j === i ? { ...s, ...change } : s)) : d));
  const patchComponent = (i: number, k: number, change: Partial<Draft["components"][number]>) =>
    setDraft((d) =>
      d
        ? d.map((s, j) =>
            j === i
              ? {
                  ...s,
                  components: s.components.map((c, m) => (m === k ? { ...c, ...change } : c)),
                }
              : s,
          )
        : d,
    );

  if (!open) {
    return (
      <button
        type="button"
        className={PRIMARY}
        onClick={() => {
          setOpen(true);
          read.mutate();
        }}
      >
        Set up from the signed SOW
      </button>
    );
  }

  return (
    <section
      className="w-full space-y-3 rounded-lg border border-border bg-card p-4"
      aria-label="Solutions from the SOW"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[14px] font-semibold">Solutions from the signed SOW</h3>
        <div className="flex gap-2">
          <button
            type="button"
            className={BUTTON}
            onClick={() => read.mutate()}
            disabled={read.isPending}
          >
            {read.isPending ? "Reading the SOW…" : "Read the SOW again"}
          </button>
          <button
            type="button"
            className={BUTTON}
            onClick={() => {
              setOpen(false);
              setDraft(null);
              setSaved(null);
            }}
          >
            Close
          </button>
        </div>
      </div>
      <p className="text-[12px] text-muted-foreground">
        These are suggestions read from the SOW. Check each one against the document, change what is
        wrong, and untick what should not be added. Nothing is saved until you confirm.
      </p>

      {read.isError ? (
        <p role="alert" className="text-[12px] text-destructive">
          {read.error instanceof Error
            ? read.error.message
            : "The SOW could not be read. Nothing has been changed."}
        </p>
      ) : null}

      {gaps.length ? (
        <div className="rounded-md border border-border bg-muted/30 p-3 text-[12px]">
          <div className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
            The SOW does not say
          </div>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {gaps.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {draft ? (
        <div className="space-y-4">
          {draft.map((s, i) => (
            <div
              key={`${s.title}-${i}`}
              className={`rounded-md border border-border p-3 ${s.include ? "" : "opacity-50"}`}
            >
              <div className="grid gap-2 md:grid-cols-[auto_1fr_auto_auto]">
                <input
                  type="checkbox"
                  checked={s.include}
                  onChange={(e) => patch(i, { include: e.target.checked })}
                  aria-label={`Include ${s.title}`}
                  className="mt-2"
                />
                <input
                  className={FIELD}
                  value={s.title}
                  onChange={(e) => patch(i, { title: e.target.value })}
                  aria-label="Solution name"
                />
                <select
                  className={FIELD}
                  value={s.scope}
                  onChange={(e) => patch(i, { scope: e.target.value as SolutionScope })}
                  aria-label="Scope"
                >
                  {SOLUTION_SCOPES.map((v) => (
                    <option key={v} value={v}>
                      {SOLUTION_SCOPE_LABEL[v]}
                    </option>
                  ))}
                </select>
                <input
                  type="date"
                  className={FIELD}
                  value={s.suggestedTarget ?? ""}
                  onChange={(e) => patch(i, { suggestedTarget: e.target.value || null })}
                  aria-label="Delivery date"
                />
              </div>
              <p className="mt-1 pl-6 text-[11px] text-muted-foreground">
                {s.suggestedTarget ? s.targetReason : `No date suggested: ${s.targetReason}`}
              </p>
              {s.sowQuote ? (
                <p className="mt-1 pl-6 text-[11px] italic text-muted-foreground">“{s.sowQuote}”</p>
              ) : null}

              <ul className="mt-2 space-y-1.5 pl-6">
                {s.components.map((c, k) => (
                  <li
                    key={`${c.name}-${k}`}
                    className={`grid gap-2 md:grid-cols-[auto_1fr_auto_auto_auto] ${c.include ? "" : "opacity-50"}`}
                  >
                    <input
                      type="checkbox"
                      checked={c.include}
                      onChange={(e) => patchComponent(i, k, { include: e.target.checked })}
                      aria-label={`Include ${c.name}`}
                      className="mt-2"
                    />
                    <input
                      className={FIELD}
                      value={c.name}
                      onChange={(e) => patchComponent(i, k, { name: e.target.value })}
                      aria-label="Component name"
                    />
                    <select
                      className={FIELD}
                      value={c.category}
                      onChange={(e) =>
                        patchComponent(i, k, {
                          category: e.target.value as ComponentCategory,
                          integrationType: null,
                        })
                      }
                      aria-label="Category"
                    >
                      {COMPONENT_CATEGORIES.map((v) => (
                        <option key={v} value={v}>
                          {CATEGORY_LABEL[v]}
                        </option>
                      ))}
                    </select>
                    {c.category === "integrations" ? (
                      <select
                        className={FIELD}
                        value={c.integrationType ?? ""}
                        onChange={(e) =>
                          patchComponent(i, k, {
                            integrationType: (e.target.value || null) as IntegrationType | null,
                          })
                        }
                        aria-label="Integration type"
                      >
                        <option value="">Integration type…</option>
                        {INTEGRATION_TYPES.map((v) => (
                          <option key={v} value={v}>
                            {INTEGRATION_TYPE_LABEL[v]}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span />
                    )}
                    <select
                      className={FIELD}
                      value={c.priority}
                      onChange={(e) =>
                        patchComponent(i, k, { priority: e.target.value as Priority })
                      }
                      aria-label="Delivery priority"
                    >
                      {PRIORITIES.map((v) => (
                        <option key={v} value={v}>
                          {PRIORITY_LABEL[v]}
                        </option>
                      ))}
                    </select>
                    <p className="text-[11px] text-muted-foreground md:col-span-5">
                      {c.dependsOn.length
                        ? `After ${c.dependsOn.join(", ")}${c.critical ? " (critical)" : ""} · `
                        : ""}
                      {c.suggestedTarget
                        ? `Date suggested from the SOW: ${c.suggestedTarget}`
                        : "No date suggested for this component."}
                      {c.sowQuote ? ` · “${c.sowQuote}”` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              className={PRIMARY}
              onClick={() => save.mutate()}
              disabled={save.isPending || !draft.some((s) => s.include)}
            >
              {save.isPending ? "Saving…" : "Save the confirmed set"}
            </button>
          </div>
          {save.isError ? (
            <p role="alert" className="text-[12px] text-destructive">
              {save.error instanceof Error ? save.error.message : "The set could not be saved."}
            </p>
          ) : null}
        </div>
      ) : null}

      {saved ? (
        <ul className="space-y-1 rounded-md border border-border bg-muted/30 p-3 text-[12px]">
          {saved.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
