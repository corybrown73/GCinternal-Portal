import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { ask } from "@/components/ui/ask";
import {
  addComponentDependency,
  addCompleteSolution,
  addSolutionComponent,
  archiveCompleteSolution,
  archiveSolutionComponent,
  confirmCompleteSolutionReadiness,
  editCompleteSolution,
  editSolutionComponent,
  getCompleteSolutionHistory,
  getCompleteSolutions,
  removeComponentDependency,
  setComponentFormTracking,
  setCompleteSolutionTarget,
} from "@/lib/complete-solutions.functions";
import {
  CATEGORY_LABEL,
  COMPONENT_STATUS_LABEL,
  COMPONENT_STATUSES,
  COMPONENT_CATEGORIES,
  INTEGRATION_TYPE_LABEL,
  INTEGRATION_TYPES,
  PRIORITIES,
  PRIORITY_LABEL,
  READINESS,
  READINESS_LABEL,
  SOLUTION_SCOPE_LABEL,
  SOLUTION_SCOPES,
  SOLUTION_STATUS_LABEL,
  SOLUTION_STATUSES,
  SUBMISSION_FIELDS_NOTE,
  isOverdue,
  shortDate,
} from "@/lib/complete-solutions";
import type {
  ComponentCategory,
  ComponentStatus,
  IntegrationType,
  Priority,
  Readiness,
  SolutionScope,
  SolutionStatus,
} from "@/lib/complete-solutions";
import type { ComponentView, HistoryEntry, SolutionView } from "@/lib/complete-solutions.server";
import { SowSolutionsReview } from "@/components/complete-solutions-sow-review";
import type { PurchaseCheck } from "@/lib/complete-solutions-purchase";

/** The input each server function takes, read from the function itself. */
type DataOf<F> = F extends (opts: { data: infer D }) => unknown ? D : never;
type SolutionEdit = DataOf<typeof editCompleteSolution>;
type TargetSet = DataOf<typeof setCompleteSolutionTarget>;
type ReadinessSet = DataOf<typeof confirmCompleteSolutionReadiness>;
type SolutionArchive = DataOf<typeof archiveCompleteSolution>;
type ComponentEdit = DataOf<typeof editSolutionComponent>;
type FormSet = DataOf<typeof setComponentFormTracking>;
type ComponentArchive = DataOf<typeof archiveSolutionComponent>;
type DependencyAdd = DataOf<typeof addComponentDependency>;
type DependencyRemove = DataOf<typeof removeComponentDependency>;
type SolutionAdd = DataOf<typeof addCompleteSolution>;
type ComponentAdd = DataOf<typeof addSolutionComponent>;
/** The workspace read: the solutions, and whether this person may change them (decided on the server). */
type WorkspaceView = { solutions: SolutionView[]; canEdit: boolean; purchase: PurchaseCheck };

const FIELD =
  "rounded-sm border border-input bg-background px-2 py-1 text-[12px] text-foreground outline-none focus:ring-1 focus:ring-ring disabled:opacity-60";
const BUTTON =
  "rounded-sm border border-border px-2.5 py-1 text-[12px] hover:bg-muted disabled:opacity-50";
const PRIMARY =
  "rounded-sm border border-primary/40 bg-primary/5 px-2.5 py-1 text-[12px] font-medium text-primary hover:bg-primary/10 disabled:opacity-50";

const today = () => new Date().toISOString().slice(0, 10);

/** The one place the workspace reads its data; every change refreshes it. */
function useCompleteSolutions(implementationId: string) {
  const fn = useServerFn(getCompleteSolutions);
  return useQuery({
    queryKey: ["complete-solutions", implementationId],
    queryFn: () => fn({ data: { implementationId } }),
  });
}

/** Runs one change, then refreshes the list. The server decides what is allowed. */
function useChange<T>(implementationId: string, run: (input: T) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["complete-solutions", implementationId] }),
  });
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : "That did not save. Nothing has been changed.";
}

/* ----------------------------------------------------------- workspace */

/**
 * The Solutions workspace for one implementation: every complete solution being
 * delivered, its components, what is outstanding, and what needs to happen next.
 * A readiness the Hub suggests is shown beside the one the TIS confirmed; the TIS
 * confirms the change.
 */
export function CompleteSolutionsWorkspace({ implementationId }: { implementationId: string }) {
  const q = useCompleteSolutions(implementationId);
  const [adding, setAdding] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  if (q.isPending) {
    return <p className="text-[12px] text-muted-foreground">Loading the solutions…</p>;
  }
  if (q.isError) {
    return (
      <p role="alert" className="text-[12px] text-destructive">
        {errorText(q.error)}
      </p>
    );
  }

  const { solutions: all, canEdit: editable, purchase } = q.data as WorkspaceView;
  const active = all.filter((s) => !s.archived);
  const archived = all.filter((s) => s.archived);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] text-muted-foreground">
          Each solution is one thing the customer is buying. Its components are the forms,
          integrations, analytics, training and other work that make it up.
        </p>
        {editable ? (
          <div className="flex gap-2">
            <SowSolutionsReview implementationId={implementationId} />
            <button type="button" className={PRIMARY} onClick={() => setAdding((v) => !v)}>
              {adding ? "Close" : "Add a solution"}
            </button>
          </div>
        ) : null}
      </div>

      <PurchaseCheckNote purchase={purchase} />

      {adding ? (
        <NewSolutionForm implementationId={implementationId} onDone={() => setAdding(false)} />
      ) : null}

      {active.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-[12px] text-muted-foreground">
          No complete solutions yet. Set them up from the signed SOW, or add one by hand.
        </p>
      ) : null}

      {active.map((s) => (
        <SolutionCard
          key={s.id}
          solution={s}
          implementationId={implementationId}
          editable={editable}
          all={all}
        />
      ))}

      {archived.length > 0 ? (
        <div>
          <button type="button" className={BUTTON} onClick={() => setShowArchived((v) => !v)}>
            {showArchived ? "Hide" : "Show"} archived ({archived.length})
          </button>
          {showArchived ? (
            <div className="mt-3 space-y-3 opacity-75">
              {archived.map((s) => (
                <SolutionCard
                  key={s.id}
                  solution={s}
                  implementationId={implementationId}
                  editable={editable}
                  all={all}
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Purchased scope against the deal's purchase record. A difference is shown, never
 * fixed here: the signed SOW decides what was agreed, and the deal is not changed.
 */
function PurchaseCheckNote({ purchase }: { purchase: PurchaseCheck }) {
  if (!purchase.hasRecord) {
    return (
      <p className="rounded-md border border-dashed border-border px-3 py-2 text-[12px] text-muted-foreground">
        This implementation has no deal, so its purchased scope cannot be checked against a purchase
        record.
      </p>
    );
  }
  const gaps = purchase.solutionsWithoutRecord.length + purchase.recordsWithoutSolution.length;
  if (gaps === 0) {
    return (
      <p className="text-[12px] text-muted-foreground">
        The purchased solutions match the deal&apos;s purchase record.
      </p>
    );
  }
  return (
    <div
      role="status"
      className="rounded-md border border-border bg-muted/40 px-3 py-2 text-[12px]"
    >
      <p className="font-medium">
        The purchased scope does not fully match the deal&apos;s purchase record. Nothing has been
        changed.
      </p>
      {purchase.solutionsWithoutRecord.length > 0 ? (
        <ul className="mt-1 list-disc pl-5">
          {purchase.solutionsWithoutRecord.map((s) => (
            <li key={s.solutionId}>
              Purchased solution with no matching item on the deal: {s.title}
            </li>
          ))}
        </ul>
      ) : null}
      {purchase.recordsWithoutSolution.length > 0 ? (
        <ul className="mt-1 list-disc pl-5">
          {purchase.recordsWithoutSolution.map((r) => (
            <li key={r.id}>Item on the deal with no solution delivering it: {r.name}</li>
          ))}
        </ul>
      ) : null}
      <p className="mt-1 text-muted-foreground">
        Check these against the signed SOW. A purchase item is linked to its solution when the SOW
        is set up.
      </p>
    </div>
  );
}

/* ----------------------------------------------------------- a solution */

function SolutionCard({
  solution: s,
  implementationId,
  editable,
  all,
}: {
  solution: SolutionView;
  implementationId: string;
  editable: boolean;
  all: SolutionView[];
}) {
  const [showHistory, setShowHistory] = useState(false);
  const [editingNext, setEditingNext] = useState(false);
  const [nextText, setNextText] = useState(s.nextAction ?? "");
  const [dateText, setDateText] = useState(s.targetDate ?? "");
  const [dateReason, setDateReason] = useState("");
  const [addingComponent, setAddingComponent] = useState(false);

  const solutionChange = useChange<
    Omit<DataOf<typeof editCompleteSolution>, "id" | "expectedUpdatedAt">
  >(implementationId, (input) =>
    editCompleteSolution({ data: { id: s.id, expectedUpdatedAt: s.updatedAt, ...input } }),
  );
  const dateChange = useChange<
    Omit<DataOf<typeof setCompleteSolutionTarget>, "id" | "expectedUpdatedAt">
  >(implementationId, (input) =>
    setCompleteSolutionTarget({ data: { id: s.id, expectedUpdatedAt: s.updatedAt, ...input } }),
  );
  const readinessChange = useChange<
    Omit<DataOf<typeof confirmCompleteSolutionReadiness>, "id" | "expectedUpdatedAt">
  >(implementationId, (input) =>
    confirmCompleteSolutionReadiness({
      data: { id: s.id, expectedUpdatedAt: s.updatedAt, ...input },
    }),
  );
  const archive = useChange<
    Omit<DataOf<typeof archiveCompleteSolution>, "id" | "expectedUpdatedAt">
  >(implementationId, (input) =>
    archiveCompleteSolution({ data: { id: s.id, expectedUpdatedAt: s.updatedAt, ...input } }),
  );

  const overdue = isOverdue(s.targetDate, s.status === "complete", today());
  const suggestion = s.readinessSuggested;
  const sameAsConfirmed = suggestion.readiness === s.readinessConfirmed;

  const confirmSuggestion = async () => {
    const reason = sameAsConfirmed
      ? null
      : `Confirmed as suggested: ${suggestion.reasons.join(" ")}`;
    try {
      await readinessChange.mutateAsync({ readiness: suggestion.readiness, reason });
    } catch {
      /* shown below */
    }
  };

  const archiveThis = async () => {
    const ok = await ask({
      title: `Archive ${s.title}?`,
      body: "Its components and history stay on record and it leaves the active views. Nothing is deleted.",
      confirmLabel: "Archive",
      destructive: true,
    });
    if (ok === true) archive.mutate({ archived: true, reason: null });
  };

  const error = solutionChange.error ?? dateChange.error ?? readinessChange.error ?? archive.error;

  return (
    <section
      className="rounded-lg border border-border bg-card p-4"
      aria-label={`Solution ${s.title}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold">{s.title}</h3>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {SOLUTION_SCOPE_LABEL[s.scope]} · {PRIORITY_LABEL[s.priority]}
            {s.source === "sow" ? " · from the SOW" : ""}
            {s.archived ? " · archived" : ""}
          </p>
          {s.sowQuote ? (
            <p className="mt-1 text-[11px] italic text-muted-foreground">“{s.sowQuote}”</p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          {editable && !s.archived ? (
            <>
              <label className="flex items-center gap-1">
                <span className="text-muted-foreground">Status</span>
                <select
                  className={FIELD}
                  value={s.status}
                  disabled={solutionChange.isPending}
                  onChange={(e) =>
                    solutionChange.mutate({ status: e.target.value as SolutionStatus })
                  }
                >
                  {SOLUTION_STATUSES.map((v) => (
                    <option key={v} value={v}>
                      {SOLUTION_STATUS_LABEL[v]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-1">
                <span className="text-muted-foreground">Priority</span>
                <select
                  className={FIELD}
                  value={s.priority}
                  disabled={solutionChange.isPending}
                  onChange={(e) => solutionChange.mutate({ priority: e.target.value as Priority })}
                >
                  {PRIORITIES.map((v) => (
                    <option key={v} value={v}>
                      {PRIORITY_LABEL[v]}
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : (
            <span className="text-muted-foreground">{SOLUTION_STATUS_LABEL[s.status]}</span>
          )}
        </div>
      </div>

      {/* Readiness: the Hub suggests, the TIS confirms. */}
      <div className="mt-3 rounded-md border border-border bg-muted/30 p-3 text-[12px]">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-medium">Readiness: {READINESS_LABEL[s.readinessConfirmed]}</span>
          <span className="text-muted-foreground">
            Suggested: {READINESS_LABEL[suggestion.readiness]}
          </span>
          {!sameAsConfirmed && editable && !s.archived ? (
            <button
              type="button"
              className={PRIMARY}
              onClick={confirmSuggestion}
              disabled={readinessChange.isPending}
            >
              Confirm “{READINESS_LABEL[suggestion.readiness]}”
            </button>
          ) : null}
          {editable && !s.archived ? (
            <ReadinessOverride
              current={s.readinessConfirmed}
              disabled={readinessChange.isPending}
              onConfirm={(readiness, reason) => readinessChange.mutate({ readiness, reason })}
            />
          ) : null}
        </div>
        {suggestion.reasons.length ? (
          <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-[11px] text-muted-foreground">
            {suggestion.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        ) : null}
      </div>

      {/* Delivery timeline. */}
      <div className="mt-3 grid gap-3 text-[12px] md:grid-cols-2">
        <div>
          <div className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
            Delivery date
          </div>
          <p className={overdue ? "font-medium text-destructive" : ""}>
            {s.targetDate ? shortDate(s.targetDate) : "Not set"}
            {overdue ? " · overdue" : ""}
            {s.originalTargetDate && s.originalTargetDate !== s.targetDate
              ? ` · first given ${shortDate(s.originalTargetDate)}`
              : ""}
          </p>
          {s.startCondition ? (
            <p className="mt-0.5 text-muted-foreground">Starts: {s.startCondition}</p>
          ) : null}
          {editable && !s.archived ? (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <input
                type="date"
                className={FIELD}
                value={dateText}
                onChange={(e) => setDateText(e.target.value)}
                aria-label="Delivery date"
              />
              {s.originalTargetDate && dateText !== (s.targetDate ?? "") ? (
                <input
                  className={`${FIELD} min-w-[14rem]`}
                  placeholder="Why does the date move? (required)"
                  value={dateReason}
                  onChange={(e) => setDateReason(e.target.value)}
                  aria-label="Reason for the date change"
                />
              ) : null}
              <button
                type="button"
                className={BUTTON}
                disabled={dateChange.isPending || dateText === (s.targetDate ?? "")}
                onClick={() =>
                  dateChange.mutate({
                    targetDate: dateText || null,
                    reason: dateReason.trim() || null,
                  })
                }
              >
                Save date
              </button>
            </div>
          ) : null}
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
            Next action
          </div>
          {editingNext ? (
            <div className="mt-1 flex flex-wrap gap-1.5">
              <input
                className={`${FIELD} min-w-[16rem] flex-1`}
                value={nextText}
                onChange={(e) => setNextText(e.target.value)}
                aria-label="Next action"
              />
              <button
                type="button"
                className={BUTTON}
                disabled={solutionChange.isPending}
                onClick={async () => {
                  try {
                    await solutionChange.mutateAsync({ nextAction: nextText.trim() || null });
                    setEditingNext(false);
                  } catch {
                    /* shown below */
                  }
                }}
              >
                Save
              </button>
              <button type="button" className={BUTTON} onClick={() => setEditingNext(false)}>
                Cancel
              </button>
            </div>
          ) : (
            <p className="mt-0.5">
              {s.nextAction ?? <span className="text-muted-foreground">None recorded.</span>}{" "}
              {editable && !s.archived ? (
                <button
                  type="button"
                  className="text-[11px] text-primary hover:underline"
                  onClick={() => setEditingNext(true)}
                >
                  {s.nextAction ? "Change" : "Add"}
                </button>
              ) : null}
            </p>
          )}
        </div>
      </div>

      {/* Components, grouped by category. */}
      <div className="mt-4 space-y-3">
        {COMPONENT_CATEGORIES.map((cat) => {
          const items = s.components.filter((c) => c.category === cat && !c.archived);
          if (items.length === 0) return null;
          return (
            <div key={cat}>
              <div className="mb-1 text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                {CATEGORY_LABEL[cat]}
              </div>
              <ul className="divide-y divide-border rounded-md border border-border">
                {items.map((c) => (
                  <ComponentRow
                    key={c.id}
                    component={c}
                    implementationId={implementationId}
                    editable={editable && !s.archived}
                    siblings={s.components.filter((x) => x.id !== c.id && !x.archived)}
                    allComponents={all.flatMap((x) => x.components)}
                  />
                ))}
              </ul>
            </div>
          );
        })}
        {s.components.some((c) => !c.archived) ? null : (
          <p className="text-[12px] text-muted-foreground">No components yet.</p>
        )}
      </div>

      {editable && !s.archived ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className={BUTTON} onClick={() => setAddingComponent((v) => !v)}>
            {addingComponent ? "Close" : "Add a component"}
          </button>
          <button
            type="button"
            className={BUTTON}
            onClick={archiveThis}
            disabled={archive.isPending}
          >
            Archive this solution
          </button>
        </div>
      ) : null}

      {addingComponent ? (
        <NewComponentForm
          solutionId={s.id}
          implementationId={implementationId}
          onDone={() => setAddingComponent(false)}
        />
      ) : null}

      <div className="mt-3">
        <button
          type="button"
          className="text-[11px] text-primary hover:underline"
          onClick={() => setShowHistory((v) => !v)}
        >
          {showHistory ? "Hide the history" : "Show the history"}
        </button>
        {showHistory ? <HistoryList solutionId={s.id} /> : null}
      </div>

      {error ? (
        <p role="alert" className="mt-2 text-[12px] text-destructive">
          {errorText(error)}
        </p>
      ) : null}
    </section>
  );
}

/** Confirms a readiness the TIS chooses, with a reason when it is a material change. */
function ReadinessOverride({
  current,
  disabled,
  onConfirm,
}: {
  current: Readiness;
  disabled: boolean;
  onConfirm: (readiness: Readiness, reason: string | null) => void;
}) {
  const [value, setValue] = useState<Readiness>(current);
  const [reason, setReason] = useState("");
  const changed = value !== current;
  const needsReason = changed && (value === "ready" || current === "ready" || value === "at_risk");
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <select
        className={FIELD}
        value={value}
        onChange={(e) => setValue(e.target.value as Readiness)}
        aria-label="Confirm readiness"
      >
        {READINESS.map((r) => (
          <option key={r} value={r}>
            {READINESS_LABEL[r]}
          </option>
        ))}
      </select>
      {needsReason ? (
        <input
          className={`${FIELD} min-w-[14rem]`}
          placeholder="Why does readiness change? (required)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          aria-label="Reason for the readiness change"
        />
      ) : null}
      <button
        type="button"
        className={BUTTON}
        disabled={disabled || !changed || (needsReason && !reason.trim())}
        onClick={() => {
          onConfirm(value, reason.trim() || null);
          setReason("");
        }}
      >
        Set readiness
      </button>
    </div>
  );
}

/* ---------------------------------------------------------- a component */

function ComponentRow({
  component: c,
  implementationId,
  editable,
  siblings,
  allComponents,
}: {
  component: ComponentView;
  implementationId: string;
  editable: boolean;
  siblings: ComponentView[];
  allComponents: ComponentView[];
}) {
  const [open, setOpen] = useState(false);
  const change = useChange<Omit<DataOf<typeof editSolutionComponent>, "id" | "expectedUpdatedAt">>(
    implementationId,
    (input) =>
      editSolutionComponent({ data: { id: c.id, expectedUpdatedAt: c.updatedAt, ...input } }),
  );
  const form = useChange<Omit<DataOf<typeof setComponentFormTracking>, "id" | "expectedUpdatedAt">>(
    implementationId,
    (input) =>
      setComponentFormTracking({ data: { id: c.id, expectedUpdatedAt: c.updatedAt, ...input } }),
  );
  const archive = useChange<
    Omit<DataOf<typeof archiveSolutionComponent>, "id" | "expectedUpdatedAt">
  >(implementationId, (input) =>
    archiveSolutionComponent({ data: { id: c.id, expectedUpdatedAt: c.updatedAt, ...input } }),
  );

  const [blocker, setBlocker] = useState(c.blocker ?? "");
  const [latest, setLatest] = useState(c.latestUpdate ?? "");
  const [next, setNext] = useState(c.nextAction ?? "");
  const [targetText, setTargetText] = useState(c.targetDate ?? "");
  const [targetReason, setTargetReason] = useState("");
  const [count, setCount] = useState(c.submissionCount == null ? "" : String(c.submissionCount));
  const [countDate, setCountDate] = useState(c.submissionCheckedOn ?? today());
  const [usageDate, setUsageDate] = useState(c.customerUsageConfirmedOn ?? "");
  const [depId, setDepId] = useState("");
  const [depCritical, setDepCritical] = useState(true);

  const overdue = isOverdue(c.targetDate, c.status === "complete", today());
  const dependencyChange = useChange<DependencyAdd>(implementationId, (input) =>
    addComponentDependency({ data: input }),
  );
  const removeDep = useChange<DependencyRemove>(implementationId, (input) =>
    removeComponentDependency({ data: input }),
  );

  const error =
    change.error ?? form.error ?? archive.error ?? dependencyChange.error ?? removeDep.error;

  return (
    <li className="px-3 py-2 text-[12px]">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0">
          <span className="font-medium">{c.name}</span>
          {c.category === "integrations" && c.integrationType ? (
            <span className="ml-1.5 text-muted-foreground">
              · {INTEGRATION_TYPE_LABEL[c.integrationType]}
            </span>
          ) : null}
          <span className="ml-1.5 text-muted-foreground">· {PRIORITY_LABEL[c.priority]}</span>
          {c.targetDate ? (
            <span
              className={
                overdue ? "ml-1.5 font-medium text-destructive" : "ml-1.5 text-muted-foreground"
              }
            >
              · {overdue ? "overdue · " : ""}target {shortDate(c.targetDate)}
              {c.originalTargetDate && c.originalTargetDate !== c.targetDate
                ? ` (first ${shortDate(c.originalTargetDate)})`
                : ""}
            </span>
          ) : null}
          {c.dependsOn.length ? (
            <span className="ml-1.5 text-muted-foreground">
              · after{" "}
              {c.dependsOn.map((d) => `${d.name}${d.critical ? " (critical)" : ""}`).join(", ")}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {editable ? (
            <select
              className={FIELD}
              value={c.status}
              disabled={change.isPending}
              aria-label={`Status of ${c.name}`}
              onChange={(e) => {
                const status = e.target.value as ComponentStatus;
                // Waiting and changes-needed need their note first: open the row instead.
                if (
                  (status === "waiting" && !c.blocker) ||
                  (status === "changes_needed" && !c.latestUpdate)
                ) {
                  setOpen(true);
                  return;
                }
                change.mutate({ status });
              }}
            >
              {COMPONENT_STATUSES.map((v) => (
                <option key={v} value={v}>
                  {COMPONENT_STATUS_LABEL[v]}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-muted-foreground">{COMPONENT_STATUS_LABEL[c.status]}</span>
          )}
          {editable ? (
            <button
              type="button"
              className="text-[11px] text-primary hover:underline"
              onClick={() => setOpen((v) => !v)}
            >
              {open ? "Close" : "Details"}
            </button>
          ) : null}
        </div>
      </div>

      {c.blocker ? <p className="mt-1 text-amber-700">Waiting on: {c.blocker}</p> : null}
      {c.latestUpdate ? (
        <p className="mt-1 text-muted-foreground">
          Latest{c.latestUpdateAt ? ` (${shortDate(c.latestUpdateAt)})` : ""}: {c.latestUpdate}
        </p>
      ) : null}
      {c.nextAction ? <p className="mt-0.5">Next: {c.nextAction}</p> : null}
      {c.category === "forms" ? (
        <p className="mt-1 text-[11px] text-muted-foreground">
          Form {c.formBuilt ? "built" : "not built"} · customer{" "}
          {c.customerApproved ? "approved" : "not yet approved"} · submissions{" "}
          {c.submissionCount == null
            ? "not entered"
            : `${c.submissionCount} (checked ${shortDate(c.submissionCheckedOn)})`}{" "}
          · usage{" "}
          {c.customerUsageConfirmedOn
            ? `confirmed ${shortDate(c.customerUsageConfirmedOn)}`
            : "not confirmed"}
        </p>
      ) : null}

      {open && editable ? (
        <div className="mt-2 space-y-3 rounded-md border border-border bg-muted/20 p-3">
          <div className="grid gap-2 md:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-muted-foreground">Delivery priority</span>
              <select
                className={FIELD}
                value={c.priority}
                onChange={(e) => change.mutate({ priority: e.target.value as Priority })}
              >
                {PRIORITIES.map((v) => (
                  <option key={v} value={v}>
                    {PRIORITY_LABEL[v]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-muted-foreground">
                Waiting on (required when Waiting)
              </span>
              <div className="flex gap-1.5">
                <input
                  className={`${FIELD} flex-1`}
                  value={blocker}
                  onChange={(e) => setBlocker(e.target.value)}
                />
                <button
                  type="button"
                  className={BUTTON}
                  disabled={change.isPending}
                  onClick={() => change.mutate({ blocker: blocker.trim() || null })}
                >
                  Save
                </button>
              </div>
            </label>
            <label className="flex flex-col gap-1 md:col-span-2">
              <span className="text-[11px] text-muted-foreground">
                Latest update (required when Changes Needed)
              </span>
              <div className="flex gap-1.5">
                <input
                  className={`${FIELD} flex-1`}
                  value={latest}
                  onChange={(e) => setLatest(e.target.value)}
                />
                <button
                  type="button"
                  className={BUTTON}
                  disabled={change.isPending}
                  onClick={() => change.mutate({ latestUpdate: latest.trim() || null })}
                >
                  Save
                </button>
              </div>
            </label>
            <label className="flex flex-col gap-1 md:col-span-2">
              <span className="text-[11px] text-muted-foreground">Next action</span>
              <div className="flex gap-1.5">
                <input
                  className={`${FIELD} flex-1`}
                  value={next}
                  onChange={(e) => setNext(e.target.value)}
                />
                <button
                  type="button"
                  className={BUTTON}
                  disabled={change.isPending}
                  onClick={() => change.mutate({ nextAction: next.trim() || null })}
                >
                  Save
                </button>
              </div>
            </label>
          </div>

          <div className="space-y-1">
            <span className="text-[11px] text-muted-foreground">Target date</span>
            <div className="flex flex-wrap items-center gap-1.5">
              <input
                type="date"
                className={FIELD}
                value={targetText}
                onChange={(e) => setTargetText(e.target.value)}
                aria-label={`Target date for ${c.name}`}
              />
              {c.originalTargetDate && targetText !== (c.targetDate ?? "") ? (
                <input
                  className={`${FIELD} min-w-[14rem]`}
                  placeholder="Why does the date move? (required)"
                  value={targetReason}
                  onChange={(e) => setTargetReason(e.target.value)}
                  aria-label="Reason for the component date change"
                />
              ) : null}
              <button
                type="button"
                className={BUTTON}
                disabled={change.isPending || targetText === (c.targetDate ?? "")}
                onClick={() =>
                  change.mutate({
                    targetDate: targetText || null,
                    targetChangeReason: targetReason.trim() || null,
                  })
                }
              >
                Save date
              </button>
            </div>
          </div>

          {c.category === "forms" ? (
            <div className="space-y-2 rounded-md border border-border p-2">
              <div className="text-[11px] font-medium">Form tracking</div>
              <div className="flex flex-wrap gap-3">
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={c.formBuilt}
                    onChange={(e) => form.mutate({ formBuilt: e.target.checked })}
                  />
                  Form built
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={c.customerApproved}
                    onChange={(e) => form.mutate({ customerApproved: e.target.checked })}
                  />
                  Customer approved
                </label>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <input
                  type="number"
                  min={0}
                  className={`${FIELD} w-28`}
                  placeholder="Submissions"
                  value={count}
                  onChange={(e) => setCount(e.target.value)}
                  aria-label="Submission count"
                />
                <span className="text-[11px] text-muted-foreground">checked on</span>
                <input
                  type="date"
                  className={FIELD}
                  value={countDate}
                  onChange={(e) => setCountDate(e.target.value)}
                  aria-label="Date the count was checked"
                />
                <button
                  type="button"
                  className={BUTTON}
                  disabled={form.isPending || (count !== "" && !countDate)}
                  onClick={() =>
                    form.mutate(
                      count === ""
                        ? { submissionCount: null }
                        : { submissionCount: Number(count), submissionCheckedOn: countDate },
                    )
                  }
                >
                  Save count
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-muted-foreground">
                  Customer usage confirmed on
                </span>
                <input
                  type="date"
                  className={FIELD}
                  value={usageDate}
                  onChange={(e) => setUsageDate(e.target.value)}
                  aria-label="Date customer usage was confirmed"
                />
                <button
                  type="button"
                  className={BUTTON}
                  disabled={form.isPending}
                  onClick={() => form.mutate({ usageConfirmedOn: usageDate || null })}
                >
                  Save usage
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground">{SUBMISSION_FIELDS_NOTE}</p>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <span className="text-[11px] text-muted-foreground">Depends on</span>
            {c.dependsOn.length ? (
              <ul className="space-y-0.5">
                {c.dependsOn.map((d) => (
                  <li key={d.id} className="flex items-center gap-2">
                    {d.name}
                    {d.critical ? <span className="text-amber-700">critical</span> : null}
                    <button
                      type="button"
                      className="text-[11px] text-muted-foreground hover:underline"
                      onClick={() => removeDep.mutate({ componentId: c.id, dependsOnId: d.id })}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {siblings.length || allComponents.length ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <select
                  className={FIELD}
                  value={depId}
                  onChange={(e) => setDepId(e.target.value)}
                  aria-label="Component this depends on"
                >
                  <option value="">Choose a component…</option>
                  {allComponents
                    .filter((x) => x.id !== c.id && !c.dependsOn.some((d) => d.id === x.id))
                    .map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                </select>
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={depCritical}
                    onChange={(e) => setDepCritical(e.target.checked)}
                  />
                  Critical
                </label>
                <button
                  type="button"
                  className={BUTTON}
                  disabled={!depId || dependencyChange.isPending}
                  onClick={() => {
                    dependencyChange.mutate({
                      componentId: c.id,
                      dependsOnId: depId,
                      critical: depCritical,
                    });
                    setDepId("");
                  }}
                >
                  Add dependency
                </button>
              </div>
            ) : null}
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              className="text-[11px] text-muted-foreground hover:underline"
              onClick={async () => {
                const ok = await ask({
                  title: `Archive ${c.name}?`,
                  body: "It leaves the active view. Its history stays on record.",
                  confirmLabel: "Archive",
                  destructive: true,
                });
                if (ok === true) archive.mutate({ archived: true, reason: null });
              }}
            >
              Archive this component
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-1 text-[12px] text-destructive">
          {errorText(error)}
        </p>
      ) : null}
    </li>
  );
}

/* ------------------------------------------------------------- new things */

function NewSolutionForm({
  implementationId,
  onDone,
}: {
  implementationId: string;
  onDone: () => void;
}) {
  const [title, setTitle] = useState("");
  const [scope, setScope] = useState<SolutionScope>("purchased");
  const [priority, setPriority] = useState<Priority>("deliver_during_implementation");
  const create = useChange<Omit<SolutionAdd, "implementationId">>(implementationId, (input) =>
    addCompleteSolution({ data: { implementationId, ...input } }),
  );
  return (
    <form
      className="grid gap-2 rounded-md border border-border bg-muted/20 p-3 text-[12px] md:grid-cols-[1fr_auto_auto_auto]"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await create.mutateAsync({ title: title.trim(), scope, priority });
          setTitle("");
          onDone();
        } catch {
          /* shown below */
        }
      }}
    >
      <input
        className={FIELD}
        placeholder="What the customer is buying, e.g. Equipment inspections"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        aria-label="Solution name"
        required
      />
      <select
        className={FIELD}
        value={scope}
        onChange={(e) => setScope(e.target.value as SolutionScope)}
        aria-label="Scope"
      >
        {SOLUTION_SCOPES.map((v) => (
          <option key={v} value={v}>
            {SOLUTION_SCOPE_LABEL[v]}
          </option>
        ))}
      </select>
      <select
        className={FIELD}
        value={priority}
        onChange={(e) => setPriority(e.target.value as Priority)}
        aria-label="Priority"
      >
        {PRIORITIES.map((v) => (
          <option key={v} value={v}>
            {PRIORITY_LABEL[v]}
          </option>
        ))}
      </select>
      <button type="submit" className={PRIMARY} disabled={create.isPending || !title.trim()}>
        Add the solution
      </button>
      {create.error ? (
        <p role="alert" className="text-destructive md:col-span-4">
          {errorText(create.error)}
        </p>
      ) : null}
    </form>
  );
}

function NewComponentForm({
  solutionId,
  implementationId,
  onDone,
}: {
  solutionId: string;
  implementationId: string;
  onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<ComponentCategory>("forms");
  const [integrationType, setIntegrationType] = useState<IntegrationType | "">("");
  const [priority, setPriority] = useState<Priority>("deliver_during_implementation");
  const [target, setTarget] = useState("");
  const create = useChange<Omit<ComponentAdd, "solutionId">>(implementationId, (input) =>
    addSolutionComponent({ data: { solutionId, ...input } }),
  );
  return (
    <form
      className="mt-3 grid gap-2 rounded-md border border-border bg-muted/20 p-3 text-[12px] md:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await create.mutateAsync({
            category,
            integrationType:
              category === "integrations" && integrationType ? integrationType : null,
            name: name.trim(),
            priority,
            targetDate: target || null,
          });
          setName("");
          onDone();
        } catch {
          /* shown below */
        }
      }}
    >
      <input
        className={FIELD}
        placeholder="Name, e.g. Pre-trip inspection form"
        value={name}
        onChange={(e) => setName(e.target.value)}
        aria-label="Component name"
        required
      />
      <select
        className={FIELD}
        value={category}
        onChange={(e) => setCategory(e.target.value as ComponentCategory)}
        aria-label="Category"
      >
        {COMPONENT_CATEGORIES.map((v) => (
          <option key={v} value={v}>
            {CATEGORY_LABEL[v]}
          </option>
        ))}
      </select>
      {category === "integrations" ? (
        <select
          className={FIELD}
          value={integrationType}
          onChange={(e) => setIntegrationType(e.target.value as IntegrationType | "")}
          aria-label="Integration type"
        >
          <option value="">Integration type…</option>
          {INTEGRATION_TYPES.map((v) => (
            <option key={v} value={v}>
              {INTEGRATION_TYPE_LABEL[v]}
            </option>
          ))}
        </select>
      ) : null}
      <select
        className={FIELD}
        value={priority}
        onChange={(e) => setPriority(e.target.value as Priority)}
        aria-label="Delivery priority"
      >
        {PRIORITIES.map((v) => (
          <option key={v} value={v}>
            {PRIORITY_LABEL[v]}
          </option>
        ))}
      </select>
      <input
        type="date"
        className={FIELD}
        value={target}
        onChange={(e) => setTarget(e.target.value)}
        aria-label="Target date (optional)"
      />
      <button type="submit" className={PRIMARY} disabled={create.isPending || !name.trim()}>
        Add the component
      </button>
      {create.error ? (
        <p role="alert" className="text-destructive md:col-span-2">
          {errorText(create.error)}
        </p>
      ) : null}
    </form>
  );
}

/* -------------------------------------------------------------- history */

function HistoryList({ solutionId }: { solutionId: string }) {
  const fn = useServerFn(getCompleteSolutionHistory);
  const q = useQuery({
    queryKey: ["complete-solutions-history", solutionId],
    queryFn: () => fn({ data: { solutionId } }),
  });
  const rows = useMemo(() => (q.data as HistoryEntry[] | undefined) ?? [], [q.data]);
  if (q.isPending)
    return <p className="mt-2 text-[12px] text-muted-foreground">Loading the history…</p>;
  if (q.isError)
    return (
      <p role="alert" className="mt-2 text-[12px] text-destructive">
        {errorText(q.error)}
      </p>
    );
  if (rows.length === 0)
    return <p className="mt-2 text-[12px] text-muted-foreground">No changes recorded yet.</p>;
  return (
    <ol className="mt-2 space-y-1 text-[11px] text-muted-foreground">
      {rows.map((r) => (
        <li key={r.id}>
          <span className="text-foreground">{shortDate(r.at)}</span> · {r.actorName ?? "Someone"} ·{" "}
          {describe(r)}
          {r.reason ? <span> — “{r.reason}”</span> : null}
        </li>
      ))}
    </ol>
  );
}

function describe(r: HistoryEntry): string {
  const what = r.componentName ? `${r.componentName}: ` : "";
  switch (r.kind) {
    case "created":
      return `${what}added${r.toValue ? ` (${r.toValue})` : ""}`;
    case "status":
      return `${what}status ${r.fromValue ?? "—"} → ${r.toValue ?? "—"}`;
    case "priority":
      return `${what}priority changed`;
    case "target_date":
      return `${what}date ${r.fromValue ? shortDate(r.fromValue) : "not set"} → ${r.toValue ? shortDate(r.toValue) : "cleared"}`;
    case "readiness_confirmed":
      return `readiness ${r.fromValue ?? "—"} → ${r.toValue ?? "—"}`;
    case "submission_count":
      return `${what}submissions ${r.toValue ?? "cleared"}`;
    case "usage_confirmed":
      return `${what}customer usage ${r.toValue ? `confirmed ${shortDate(r.toValue)}` : "cleared"}`;
    case "sow_import":
      return `taken from ${r.toValue ?? "the SOW"}`;
    case "dependency_added":
      return `${what}now depends on ${r.toValue ?? "another component"}`;
    case "dependency_removed":
      return `${what}no longer depends on ${r.fromValue ?? "a component"}`;
    case "archived":
      return `${what}archived`;
    case "restored":
      return `${what}restored`;
    default:
      return `${what}${r.kind.replace(/_/g, " ")}`;
  }
}
