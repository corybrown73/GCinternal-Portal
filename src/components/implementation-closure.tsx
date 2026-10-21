import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Ban } from "lucide-react";

import { ask } from "@/components/ui/ask";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useProfile } from "@/lib/auth";
import {
  canCloseImplementation,
  CLOSURE_EXPLANATION,
  CLOSURE_NOTE_MAX,
  CLOSURE_REASON_LABEL,
  closureSummary,
  type ClosureReason,
} from "@/lib/implementation-closure";
import { closeImplementationFn } from "@/lib/hub.functions";
import { cn } from "@/lib/utils";

type ClosableImplementation = {
  id: string;
  name: string;
  owner_id: string | null;
  closed_at?: string | null;
  closure_reason?: string | null;
  closure_note?: string | null;
};

const PRIMARY =
  "inline-flex items-center gap-1.5 rounded-sm border border-destructive/40 bg-destructive/5 px-2.5 py-1 text-[12px] font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50";
const FIELD =
  "w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-[12px] text-foreground outline-none focus:ring-1 focus:ring-ring disabled:opacity-60";

/**
 * The label a closed implementation carries wherever its record is shown:
 * what closed it, why, and when. It states the closure and never a result.
 */
export function ClosedImplementationNotice({ impl }: { impl: ClosableImplementation }) {
  const summary = closureSummary(impl);
  if (!summary) return null;
  return (
    <div
      role="status"
      className="mx-6 mt-3 rounded-md border border-border bg-muted/40 px-3 py-2 text-[12px]"
    >
      <p className="flex items-center gap-1.5 font-semibold text-foreground">
        <Ban className="h-3.5 w-3.5 text-muted-foreground" />
        {summary.badge}
      </p>
      <p className="mt-0.5 text-muted-foreground">
        Reason: {summary.reason}
        {summary.closedOn ? ` · closed ${summary.closedOn}` : ""}
      </p>
      {summary.note ? <p className="mt-0.5 text-muted-foreground">{summary.note}</p> : null}
      <p className="mt-1 text-[11px] text-muted-foreground">
        This implementation was not completed or graduated. Its stage, owner and dates are frozen,
        and its notes and history remain.
      </p>
    </div>
  );
}

/**
 * The "Close implementation" action. Shown only to someone the rules let close
 * it: a manager, an admin, or the implementation's own specialist. The database
 * decides again on every click, so a stale view cannot close what it shouldn't.
 */
export function CloseImplementationAction({
  customerId,
  impl,
}: {
  customerId: string;
  impl: ClosableImplementation;
}) {
  const { profile } = useProfile();
  const qc = useQueryClient();
  const closeFn = useServerFn(closeImplementationFn);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState<string | null>(null);

  const may = canCloseImplementation({
    role: profile?.role,
    teamMemberId: profile?.team_member_id ?? null,
    ownerTeamMemberId: impl.owner_id,
    closedAt: impl.closed_at ?? null,
  });

  const close = useMutation({
    mutationFn: async () => {
      return closeFn({
        data: {
          implementationId: impl.id,
          reason: "implementation_not_required" satisfies ClosureReason,
          note: note.trim(),
        },
      });
    },
    onSuccess: () => {
      setOpen(false);
      setNote("");
      void qc.invalidateQueries({ queryKey: ["customer360", customerId] });
    },
  });

  if (!may) return null;

  const submit = async () => {
    if (!note.trim()) {
      setNoteError("Add a short explanation of why the implementation is closed.");
      return;
    }
    setNoteError(null);
    const confirmed = await ask({
      title: `Close ${impl.name}?`,
      body: "This ends the implementation without completing or graduating it. It leaves the active lists and alerts, and stays as history. Nothing is deleted.",
      confirmLabel: "Close implementation",
      destructive: true,
    });
    if (confirmed !== true) return;
    close.mutate();
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={PRIMARY}>
        <Ban className="h-3 w-3" />
        Close implementation
      </button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next && close.isPending) return;
          setOpen(next);
          if (!next) {
            setNoteError(null);
            close.reset();
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Close implementation</DialogTitle>
            <DialogDescription>{CLOSURE_EXPLANATION}</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <fieldset className="space-y-1.5">
              <legend className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Reason
              </legend>
              <label className="flex items-center gap-2 text-[12px]">
                <input type="radio" name="closure-reason" checked readOnly className="h-3 w-3" />
                {CLOSURE_REASON_LABEL.implementation_not_required}
              </label>
            </fieldset>

            <label className="block space-y-1">
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Explanation
              </span>
              <textarea
                value={note}
                maxLength={CLOSURE_NOTE_MAX}
                rows={4}
                disabled={close.isPending}
                onChange={(e) => {
                  setNote(e.target.value);
                  setNoteError(null);
                }}
                aria-label="Explanation"
                aria-invalid={noteError ? true : undefined}
                className={cn(FIELD, "resize-y", noteError && "border-destructive")}
              />
              {noteError ? <span className="text-[11px] text-destructive">{noteError}</span> : null}
            </label>

            {close.isError ? (
              <p className="text-[12px] text-destructive">{(close.error as Error).message}</p>
            ) : null}
          </div>

          <DialogFooter>
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={close.isPending}
              className="rounded-sm border border-border px-2.5 py-1 text-[12px] hover:bg-muted disabled:opacity-50"
            >
              Keep open
            </button>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={close.isPending}
              className={PRIMARY}
            >
              {close.isPending ? "Closing…" : "Close implementation"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
