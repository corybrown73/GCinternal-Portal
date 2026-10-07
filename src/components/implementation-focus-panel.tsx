import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Plus, RefreshCw, Trash2 } from "lucide-react";

import { Panel } from "@/components/record";
import { canEditDeal, useProfile } from "@/lib/auth";
import {
  confirmImplementationFocusFn,
  generateImplementationFocusFn,
} from "@/lib/implementation-focus.functions";
import type { ImplementationFocusItem, IntakeAnswers } from "@/lib/intake-answers";
import { shortDay } from "@/lib/onboarding-timeline";
import { saveIntake } from "@/lib/presale.functions";

const SOURCE_LABEL: Record<ImplementationFocusItem["sources"][number]["type"], string> = {
  sow: "SOW",
  intake: "Intake",
  gong: "Gong",
};

/**
 * Compact internal review for Implementation Focus: propose from existing
 * SOW/intake/handoff truth, let the TIS edit the list by hand, then
 * confirm it with the customer. Internal only — nothing here is rendered
 * on the public Welcome page. Lives on Current Implementation because
 * this is pre-kickoff preparation, the same place the rest of the TIS's
 * day-to-day work is.
 */
export function ImplementationFocusPanel({
  dealId,
  intake,
}: {
  dealId: string;
  intake: IntakeAnswers;
}) {
  const { profile } = useProfile();
  const editable = canEditDeal(profile?.role);
  const qc = useQueryClient();
  const generate = useServerFn(generateImplementationFocusFn);
  const confirmFn = useServerFn(confirmImplementationFocusFn);
  const save = useServerFn(saveIntake);

  const [error, setError] = useState<string | null>(null);
  const [draftText, setDraftText] = useState("");

  const focus = intake.implementation_focus;
  const agreed = Boolean(focus.validated_at);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["deal", dealId] });
    void qc.invalidateQueries({ queryKey: ["welcome", dealId] });
  };

  const genMutation = useMutation({
    mutationFn: () => generate({ data: { dealId } }),
    onMutate: () => setError(null),
    onSuccess: invalidate,
    onError: (e) => setError(e instanceof Error ? e.message : "Could not generate."),
  });

  const confirmMutation = useMutation({
    mutationFn: () => confirmFn({ data: { dealId } }),
    onMutate: () => setError(null),
    onSuccess: invalidate,
    onError: (e) => setError(e instanceof Error ? e.message : "Could not confirm."),
  });

  const writeItems = useMutation({
    mutationFn: (items: ImplementationFocusItem[]) =>
      save({ data: { dealId, patch: { implementation_focus: { ...focus, items } } } }),
    onMutate: () => setError(null),
    onSuccess: invalidate,
    onError: (e) => setError(e instanceof Error ? e.message : "Could not save."),
  });

  const editText = (id: string, text: string) =>
    writeItems.mutate(focus.items.map((i) => (i.id === id ? { ...i, text } : i)));
  const removeItem = (id: string) => writeItems.mutate(focus.items.filter((i) => i.id !== id));
  const addItem = () => {
    const text = draftText.trim();
    if (!text) return;
    const item: ImplementationFocusItem = {
      id: `manual-${Math.random().toString(36).slice(2, 8)}`,
      text,
      status: "proposed",
      sources: [],
      review_flag: null,
    };
    writeItems.mutate([...focus.items, item]);
    setDraftText("");
  };

  return (
    <Panel
      title={agreed ? "Agreed Implementation Focus" : "Implementation Focus"}
      level="primary"
      collapsible
      defaultOpen
      collapseKey="customer:implementation:focus"
      meta={
        agreed
          ? `Confirmed ${shortDay(focus.validated_at!)}`
          : focus.items.length
            ? `${focus.items.length} proposed · not yet confirmed`
            : "Not generated yet"
      }
    >
      <div className="space-y-2.5 p-3">
        {error ? <p className="text-[12px] text-destructive">{error}</p> : null}

        {!agreed && editable ? (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-sm border border-border px-2 py-1 text-[11px] hover:bg-muted disabled:opacity-50"
              disabled={genMutation.isPending}
              onClick={() => genMutation.mutate()}
            >
              <RefreshCw className="h-3 w-3" />
              {genMutation.isPending
                ? "Generating…"
                : focus.items.length
                  ? "Refresh proposal"
                  : "Generate proposed focus"}
            </button>
            {focus.items.length ? (
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-sm bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                disabled={confirmMutation.isPending}
                onClick={() => confirmMutation.mutate()}
                title="The TIS reviewed this with the customer and confirmed what this implementation is focusing on"
              >
                {confirmMutation.isPending ? "Confirming…" : "Confirm implementation focus"}
              </button>
            ) : null}
          </div>
        ) : null}

        {focus.items.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">
            Nothing proposed yet. Generating reads the purchased services, the named forms and the
            handoff — review it with the customer before confirming.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {focus.items.map((item) => (
              <li key={item.id} className="space-y-1 px-2.5 py-2 text-[12px]">
                <div className="flex items-start justify-between gap-2">
                  {editable && !agreed ? (
                    <input
                      className="w-full rounded-sm border border-transparent bg-transparent px-0 py-0 text-[12px] outline-none focus:border-border focus:bg-background focus:px-1"
                      defaultValue={item.text}
                      onBlur={(e) => {
                        const next = e.target.value.trim();
                        if (next && next !== item.text) editText(item.id, next);
                      }}
                    />
                  ) : (
                    <span>{item.text}</span>
                  )}
                  {editable && !agreed ? (
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => removeItem(item.id)}
                      title="Remove"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {[...new Set(item.sources.map((s) => s.type))].map((t) => (
                    <span
                      key={t}
                      className="rounded-sm bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                    >
                      {SOURCE_LABEL[t]}
                    </span>
                  ))}
                  {item.review_flag === "gong_only" ? (
                    <span className="inline-flex items-center gap-1 rounded-sm bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:text-amber-300">
                      <AlertTriangle className="h-3 w-3" /> Gong only — not yet confirmed
                    </span>
                  ) : null}
                  {item.review_flag === "conflict" ? (
                    <span className="inline-flex items-center gap-1 rounded-sm bg-red-500/15 px-1.5 py-0.5 text-[10px] font-medium text-red-800 dark:text-red-300">
                      <AlertTriangle className="h-3 w-3" /> Conflicts with the SOW
                    </span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}

        {!agreed && editable ? (
          <div className="flex items-center gap-1.5">
            <input
              className="h-7 min-w-[160px] flex-1 rounded-sm border border-border bg-background px-1.5 text-[12px] outline-none focus:ring-1 focus:ring-ring"
              placeholder="Add a focus item by hand"
              value={draftText}
              onChange={(e) => setDraftText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addItem();
              }}
            />
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-sm border border-border px-2 py-1 text-[11px] hover:bg-muted disabled:opacity-50"
              disabled={!draftText.trim()}
              onClick={addItem}
            >
              <Plus className="h-3 w-3" /> Add
            </button>
          </div>
        ) : null}
      </div>
    </Panel>
  );
}
