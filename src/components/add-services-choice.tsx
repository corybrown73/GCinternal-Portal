import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PlusCircle, X } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { canEditDeal, useProfile } from "@/lib/auth";
import { dealQuery } from "@/lib/deal-query";
import { startServicesDealFn } from "@/lib/deal-pulse.functions";
import { addJournalEntry } from "@/lib/hub.functions";
import { readIntake } from "@/lib/intake-answers";
import {
  normalizeServices,
  SERVICE_KIND_LIST,
  SERVICE_KINDS,
  type ServiceKind,
  type ServiceSpec,
} from "@/lib/onboarding-services";
import { saveIntake } from "@/lib/presale.functions";
import { cn } from "@/lib/utils";

const inputClass =
  "h-7 rounded-sm border border-border bg-background px-1.5 text-[12px] text-foreground outline-none focus:ring-1 focus:ring-ring";

/** Same phase choices TimelinePanel offers for a new service (not exported there). */
const PHASE_OPTIONS = [
  { value: 1, label: "1 · with the form" },
  { value: 2, label: "2 · after the form" },
  { value: 3, label: "3" },
  { value: 4, label: "4" },
];

/**
 * "Add services" can mean two things, so it asks first: fold newly purchased
 * work into the implementation already underway, or start it as its own —
 * the existing-customer path a fresh services deal already runs. Option B
 * below is exactly that existing flow, untouched. Option A appends to the
 * same deal's intake.timeline.services — the single source Overview and
 * Current Implementation (SolutionsCard, the plan) already read — through
 * the same saveIntake patch TimelinePanel.writeServices() sends, so nothing
 * downstream needs to change to pick it up.
 */
export function AddServicesChoice({
  customerId,
  dealId,
  implementationId,
}: {
  customerId: string;
  /** The current implementation's deal, when it has one. Option A needs it. */
  dealId: string | null;
  implementationId: string | null;
}) {
  const { profile } = useProfile();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const startSeparate = useServerFn(startServicesDealFn);
  const saveIntakeFn = useServerFn(saveIntake);
  const addNote = useServerFn(addJournalEntry);

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"choice" | "picker">("choice");
  const [staged, setStaged] = useState<ServiceSpec[]>([]);
  const [kind, setKind] = useState<ServiceKind>("integration");
  const [name, setName] = useState("");
  const [phase, setPhase] = useState<number>(SERVICE_KINDS.integration.defaultPhase);
  const [journalWarning, setJournalWarning] = useState<string | null>(null);

  const canAddToThis = Boolean(dealId && implementationId);
  const deal = useQuery({ ...dealQuery(dealId ?? ""), enabled: canAddToThis && open });

  const reset = () => {
    setStep("choice");
    setStaged([]);
    setKind("integration");
    setName("");
    setPhase(SERVICE_KINDS.integration.defaultPhase);
  };

  const separate = useMutation({
    mutationFn: () => startSeparate({ data: { customerId } }),
    onSuccess: (r) => {
      setOpen(false);
      reset();
      void navigate({
        to: "/customers/$customerId",
        params: { customerId },
        search: {
          tab: "implementation",
          ...(r.implementationId ? { impl: r.implementationId } : {}),
        },
      });
    },
  });

  const addToThis = useMutation({
    mutationFn: async () => {
      if (!dealId || !implementationId || !deal.data) {
        throw new Error("Still loading the current plan — try again in a moment.");
      }
      const knobs = readIntake(deal.data.account.intake).timeline;
      const existing = normalizeServices(knobs.services as ServiceSpec[], knobs);
      await saveIntakeFn({
        data: {
          dealId,
          patch: {
            timeline: {
              ...knobs,
              services: [...existing, ...staged],
              integration_tier: 0,
              integration_target: null,
            },
          },
        },
      });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["deal", dealId] }),
        qc.invalidateQueries({ queryKey: ["welcome", dealId] }),
      ]);
      // The service change is already saved; a journal failure here is a
      // secondary, non-blocking problem — never retried as a second save.
      try {
        await addNote({
          data: {
            implementationId,
            note: `Services added to this implementation: ${staged.map((s) => s.name).join(", ")}`,
            authorId: null,
            links: null,
            attachmentUrl: null,
            attachmentName: null,
            kind: "note",
          },
        });
      } catch (e) {
        console.error("[add-services] service scope saved, but the journal note failed to save", e);
        setJournalWarning("Services were added, but the history note could not be saved.");
      }
    },
    onSuccess: () => {
      setOpen(false);
      reset();
    },
  });

  if (!canEditDeal(profile?.role)) return null;

  const pickKind = (k: ServiceKind) => {
    setKind(k);
    setPhase(SERVICE_KINDS[k].defaultPhase);
  };
  const addRow = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const id = `${kind.slice(0, 4)}-${Math.random().toString(36).slice(2, 8)}`;
    setStaged((rows) => [
      ...rows,
      { id, kind, name: trimmed, phase, ...(kind === "integration" ? { tier: 3 } : {}) },
    ]);
    setName("");
  };
  const removeRow = (id: string) => setStaged((rows) => rows.filter((r) => r.id !== id));

  return (
    <span className="inline-flex flex-col items-end">
      <button
        type="button"
        onClick={() => {
          reset();
          setOpen(true);
        }}
        className="inline-flex items-center gap-1 rounded-sm border border-primary/40 bg-card px-2 py-1 text-[11px] font-medium text-primary hover:bg-primary/5"
        title="They bought forms, an integration or training: start or extend the services plan"
      >
        <PlusCircle className="h-3 w-3" />
        Add services
      </button>
      {journalWarning ? (
        <span className="mt-1 max-w-[220px] text-right text-[11px] text-amber-700 dark:text-amber-400">
          {journalWarning}
        </span>
      ) : null}

      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) reset();
        }}
      >
        <DialogContent className="max-w-md">
          {step === "choice" ? (
            <>
              <DialogHeader>
                <DialogTitle className="text-[14px]">
                  How should this new work be handled?
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-2">
                <button
                  type="button"
                  disabled={!canAddToThis}
                  onClick={() => setStep("picker")}
                  className="block w-full rounded-md border border-border bg-card px-3 py-2.5 text-left hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                  title={
                    canAddToThis
                      ? undefined
                      : "This customer has no current implementation to add to"
                  }
                >
                  <span className="block text-[13px] font-medium">Add to this implementation</span>
                  <span className="block text-[12px] text-muted-foreground">
                    Include these services in the implementation already underway.
                  </span>
                </button>
                <button
                  type="button"
                  disabled={separate.isPending}
                  onClick={() => separate.mutate()}
                  className="block w-full rounded-md border border-border bg-card px-3 py-2.5 text-left hover:bg-muted disabled:opacity-60"
                >
                  <span className="block text-[13px] font-medium">
                    {separate.isPending ? "Starting…" : "Start separately"}
                  </span>
                  <span className="block text-[12px] text-muted-foreground">
                    Track these services as their own implementation.
                  </span>
                </button>
              </div>
              {separate.isError ? (
                <p className="text-[12px] text-destructive">
                  {separate.error instanceof Error ? separate.error.message : "Could not start."}
                </p>
              ) : null}
              <DialogFooter>
                <button
                  type="button"
                  className="rounded-md border border-border px-3 py-1.5 text-[12px] hover:bg-muted"
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="text-[14px]">Add to this implementation</DialogTitle>
                <DialogDescription className="text-[12px]">
                  The same fields the plan already tracks for a service.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <select
                    className={inputClass}
                    value={kind}
                    onChange={(e) => pickKind(e.target.value as ServiceKind)}
                  >
                    {SERVICE_KIND_LIST.map((k) => (
                      <option key={k.kind} value={k.kind}>
                        {k.label}
                      </option>
                    ))}
                  </select>
                  <input
                    className={cn(inputClass, "min-w-[140px] flex-1")}
                    placeholder="What the SOW calls it"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") addRow();
                    }}
                  />
                  <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    Phase
                    <select
                      className={inputClass}
                      value={phase}
                      onChange={(e) => setPhase(Number(e.target.value))}
                    >
                      {PHASE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-sm border border-border px-2 py-1 text-[11px] hover:bg-muted disabled:opacity-50"
                    disabled={!name.trim()}
                    onClick={addRow}
                  >
                    Add
                  </button>
                </div>
                {staged.length ? (
                  <ul className="divide-y divide-border rounded-md border border-border">
                    {staged.map((s) => (
                      <li
                        key={s.id}
                        className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-[12px]"
                      >
                        <span>
                          {s.name}{" "}
                          <span className="text-muted-foreground">
                            · {SERVICE_KINDS[s.kind].label}
                          </span>
                        </span>
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => removeRow(s.id)}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[12px] text-muted-foreground">
                    Add one or more services, then save.
                  </p>
                )}
                {addToThis.isError ? (
                  <p className="text-[12px] text-destructive">
                    {addToThis.error instanceof Error ? addToThis.error.message : "Could not save."}
                  </p>
                ) : null}
              </div>
              <DialogFooter>
                <button
                  type="button"
                  className="rounded-md border border-border px-3 py-1.5 text-[12px] hover:bg-muted"
                  onClick={() => setOpen(false)}
                  disabled={addToThis.isPending}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="rounded-md bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground disabled:opacity-50"
                  disabled={!staged.length || addToThis.isPending || !deal.data}
                  onClick={() => addToThis.mutate()}
                >
                  {addToThis.isPending
                    ? "Saving…"
                    : `Save${staged.length ? ` (${staged.length})` : ""}`}
                </button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </span>
  );
}
