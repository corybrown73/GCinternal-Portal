import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Copy, Send } from "lucide-react";

import { HandoffChip, handoffDetail } from "@/components/handoff-chip";
import { Panel } from "@/components/record";
import { ask } from "@/components/ui/ask";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { DealData } from "@/lib/deal-query";
import { readIntake, type HandoffSource, type IntakeAnswers } from "@/lib/intake-answers";
import { stampDay } from "@/lib/stage-flow";
import { saveHandoffAnswer, sendHandoffToCustomer, setHandoffFlags } from "@/lib/presale.functions";
import {
  answerSource,
  answerValue,
  defaultAsk,
  HANDOFF_GROUP_LABEL,
  HANDOFF_QUESTIONS,
  handoffChecks,
  isAnswered,
  SOURCE_LABEL,
  type HandoffGroup,
  type HandoffQuestion,
  type HandoffValue,
} from "@/lib/sales-handoff";
import { cn } from "@/lib/utils";

const inputClass =
  "w-full rounded-sm border border-border bg-background px-2 py-1 text-[13px] text-foreground outline-none focus:ring-1 focus:ring-ring disabled:opacity-60";

/**
 * THE HANDOFF, on the deal. "So this is what we know so far — and there are
 * a few things outstanding." The Sales half anyone internal fills; the
 * customer half can be sent to the customer on their welcome link. Every
 * answer says who gave it. Saves one answer at a time, on blur.
 */
export function HandoffIntakePanel({
  deal,
  editable,
  defaultOpen = true,
}: {
  deal: DealData;
  editable: boolean;
  defaultOpen?: boolean;
}) {
  const intake = readIntake(deal.account.intake);
  if (intake.path === "field_fusion") return null;
  const checks = handoffChecks(intake);
  const groups = [...new Set(HANDOFF_QUESTIONS.map((q) => q.group))] as HandoffGroup[];
  return (
    <Panel
      id="panel-handoff"
      title="Handoff from Sales"
      meta={
        <span className="inline-flex flex-wrap items-center gap-2">
          <HandoffChip status={checks.status} detail={handoffDetail(checks)} />
          <span>
            {checks.answered} of {checks.total} answered
          </span>
        </span>
      }
      level="default"
      collapsible
      defaultOpen={defaultOpen}
      collapseKey="deal:handoff"
      action={editable ? <SendToCustomer deal={deal} intake={intake} /> : undefined}
    >
      <div className="divide-y divide-border">
        <SideHeader
          title="What Sales knows"
          done={checks.salesComplete.done}
          line={
            checks.salesComplete.done
              ? intake.handoff.completed_at
                ? `Marked complete ${stampDay(intake.handoff.completed_at)}`
                : "Every required answer is in."
              : `${checks.salesComplete.missing.length} required answer${checks.salesComplete.missing.length === 1 ? "" : "s"} still blank.`
          }
          action={editable ? <CompleteToggle deal={deal} intake={intake} /> : null}
        />
        {groups
          .filter((g) => g !== "ready")
          .map((g) => (
            <Group key={g} group={g} deal={deal} intake={intake} editable={editable} />
          ))}
        <SourceMaterial deal={deal} intake={intake} />
        <SideHeader
          title="What the customer tells us"
          done={checks.customerReady.done}
          line={
            checks.customerReady.overridden
              ? `Going ahead without the rest: ${intake.handoff.customer_ready_override!.reason}`
              : checks.customerReady.done
                ? "Their answers are in."
                : checks.status === "sent"
                  ? `With the customer since ${stampDay(intake.handoff.sent_to_customer_at!)}. ${checks.customerReady.missing.length} still to come.`
                  : "Not sent yet. Send them the questions, or answer what you already know."
          }
          action={editable ? <ReadyOverride deal={deal} intake={intake} /> : null}
        />
        <Group group="ready" deal={deal} intake={intake} editable={editable} />
      </div>
    </Panel>
  );
}

function SideHeader({
  title,
  done,
  line,
  action,
}: {
  title: string;
  done: boolean;
  line: string;
  action: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 bg-muted/40 px-4 py-2">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "inline-flex h-4 w-4 items-center justify-center rounded-full border",
            done
              ? "border-status-ontrack-foreground bg-status-ontrack text-status-ontrack-foreground"
              : "border-amber-500/60 text-amber-700",
          )}
        >
          {done ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
        </span>
        <span className="text-[12px] font-semibold">{title}</span>
        <span className="text-[12px] text-muted-foreground">{line}</span>
      </div>
      {action}
    </div>
  );
}

function Group({
  group,
  deal,
  intake,
  editable,
}: {
  group: HandoffGroup;
  deal: DealData;
  intake: IntakeAnswers;
  editable: boolean;
}) {
  const qs = HANDOFF_QUESTIONS.filter((q) => q.group === group);
  return (
    <div className="px-4 py-3">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {HANDOFF_GROUP_LABEL[group]}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {qs.map((q) => (
          <Row key={q.key} q={q} deal={deal} intake={intake} editable={editable} />
        ))}
      </div>
    </div>
  );
}

const SOURCE_TONE: Record<HandoffSource, string> = {
  sales: "bg-muted text-muted-foreground",
  ai: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  tis: "bg-muted text-muted-foreground",
  customer: "bg-status-ontrack text-status-ontrack-foreground",
};

function Row({
  q,
  deal,
  intake,
  editable,
}: {
  q: HandoffQuestion;
  deal: DealData;
  intake: IntakeAnswers;
  editable: boolean;
}) {
  const qc = useQueryClient();
  const save = useServerFn(saveHandoffAnswer);
  const value = answerValue(intake, q.key);
  const source = answerSource(intake, q.key);
  const quote = intake.handoff.answers[q.key]?.quote ?? null;
  const toText = (v: HandoffValue) =>
    v === null ? "" : Array.isArray(v) ? v.join("\n") : typeof v === "boolean" ? "" : v;
  const [draft, setDraft] = useState(toText(value));
  const last = useRef(toText(value));
  useEffect(() => {
    // The record changed under us (the AI filled it, the customer answered):
    // follow it unless the person is mid-edit.
    const next = toText(value);
    if (next !== last.current) {
      last.current = next;
      setDraft(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(value)]);
  const m = useMutation({
    mutationFn: (v: HandoffValue) =>
      save({ data: { dealId: deal.account.id, key: q.key, value: v } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["deal", deal.account.id] }),
  });
  const commit = () => {
    const trimmed = draft.trim();
    const v: HandoffValue =
      q.kind === "list"
        ? trimmed
          ? trimmed
              .split("\n")
              .map((s) => s.trim())
              .filter(Boolean)
          : null
        : trimmed || null;
    if (JSON.stringify(v) === JSON.stringify(value) || (v === null && !isAnswered(value))) return;
    last.current = toText(v);
    m.mutate(v);
  };
  const commitmentsNone = q.key === "commitments" && intake.handoff.commitments_none;
  return (
    <div className={cn("min-w-0", (q.kind === "long" || q.kind === "list") && "sm:col-span-2")}>
      <div className="mb-0.5 flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-medium">
          {q.label}
          {q.required ? <span className="text-amber-700"> *</span> : null}
        </span>
        {source ? (
          <span
            title={quote ? `From: “${quote}”` : SOURCE_LABEL[source]}
            className={cn(
              "rounded-sm px-1 py-px text-[10px] font-medium",
              SOURCE_TONE[source],
              quote && "cursor-help underline decoration-dotted",
            )}
          >
            {source === "ai" ? "AI" : SOURCE_LABEL[source]}
          </span>
        ) : commitmentsNone ? (
          <span className="rounded-sm bg-muted px-1 py-px text-[10px] text-muted-foreground">
            None beyond the SOW
          </span>
        ) : (
          <span className="rounded-sm border border-dashed border-border px-1 py-px text-[10px] text-muted-foreground">
            blank
          </span>
        )}
        {m.isPending ? <span className="text-[10px] text-muted-foreground">Saving…</span> : null}
        {m.isError ? (
          <span className="text-[10px] text-destructive">
            {m.error instanceof Error ? m.error.message : "Could not save"}
          </span>
        ) : null}
      </div>
      {q.kind === "yesno" ? (
        <div className="flex gap-1">
          {[
            ["Yes", true],
            ["No", false],
          ].map(([label, v]) => (
            <button
              key={String(label)}
              type="button"
              disabled={!editable || m.isPending}
              onClick={() => m.mutate(value === v ? null : (v as boolean))}
              className={cn(
                "rounded-sm border px-2 py-0.5 text-[12px]",
                value === v
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border hover:bg-muted",
              )}
            >
              {label as string}
            </button>
          ))}
        </div>
      ) : q.kind === "long" || q.kind === "list" ? (
        <textarea
          className={cn(inputClass, "min-h-[52px] resize-y")}
          rows={q.kind === "list" ? 3 : 2}
          value={draft}
          placeholder={q.kind === "list" ? `${q.hint} One per line.` : q.hint}
          disabled={!editable || m.isPending || commitmentsNone}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
        />
      ) : (
        <input
          type={q.kind === "date" ? "date" : "text"}
          className={inputClass}
          value={draft}
          placeholder={q.kind === "contact" ? "Name · role · email" : q.hint}
          disabled={!editable || m.isPending}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
        />
      )}
      {q.key === "commitments" && editable ? <CommitmentsNone deal={deal} intake={intake} /> : null}
    </div>
  );
}

function CommitmentsNone({ deal, intake }: { deal: DealData; intake: IntakeAnswers }) {
  const qc = useQueryClient();
  const set = useServerFn(setHandoffFlags);
  const m = useMutation({
    mutationFn: (on: boolean) => set({ data: { dealId: deal.account.id, commitments_none: on } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["deal", deal.account.id] }),
  });
  return (
    <label className="mt-1 inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
      <input
        type="checkbox"
        checked={intake.handoff.commitments_none}
        disabled={m.isPending}
        onChange={(e) => m.mutate(e.target.checked)}
      />
      Nothing was promised beyond the SOW
    </label>
  );
}

function SourceMaterial({ deal, intake }: { deal: DealData; intake: IntakeAnswers }) {
  const sow =
    Boolean(deal.account.sow_document_path) || Boolean(deal.account.sow_reference?.trim());
  const notes = deal.gong_reports.length;
  const forms = intake.uploaded_forms.length;
  const parts = [
    sow ? "SOW on file" : "no SOW yet",
    `${notes} call note${notes === 1 ? "" : "s"}`,
    forms ? `${forms} uploaded form${forms === 1 ? "" : "s"}` : "no forms uploaded",
  ];
  return (
    <div className="px-4 py-3">
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Source material
      </p>
      <p className="text-[12px]">
        {parts.join(" · ")}.{" "}
        <span className="text-muted-foreground">
          Transcripts, forms and the SOW go on the record below; the AI reads them into the answers
          above.
        </span>
      </p>
    </div>
  );
}

function CompleteToggle({ deal, intake }: { deal: DealData; intake: IntakeAnswers }) {
  const qc = useQueryClient();
  const set = useServerFn(setHandoffFlags);
  const done = Boolean(intake.handoff.completed_at);
  const m = useMutation({
    mutationFn: (completed: boolean) => set({ data: { dealId: deal.account.id, completed } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["deal", deal.account.id] }),
  });
  return (
    <button
      type="button"
      disabled={m.isPending}
      onClick={() => m.mutate(!done)}
      className="rounded-md border border-border bg-card px-2 py-0.5 text-[11px] hover:bg-muted"
    >
      {done ? "Reopen" : "Mark complete"}
    </button>
  );
}

function ReadyOverride({ deal, intake }: { deal: DealData; intake: IntakeAnswers }) {
  const qc = useQueryClient();
  const set = useServerFn(setHandoffFlags);
  const on = Boolean(intake.handoff.customer_ready_override);
  const m = useMutation({
    mutationFn: (override: { reason: string } | null) =>
      set({ data: { dealId: deal.account.id, customer_ready_override: override } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["deal", deal.account.id] }),
  });
  return (
    <button
      type="button"
      disabled={m.isPending}
      onClick={async () => {
        if (on) {
          m.mutate(null);
          return;
        }
        const reason = await ask({
          title: "Go ahead without the customer's answers?",
          body: "Kickoff can start without them; say why, so the record shows it was a decision.",
          confirmLabel: "Go ahead",
          prompt: { label: "Why", placeholder: "Covered on the closing call", required: true },
        });
        if (typeof reason === "string" && reason.trim()) m.mutate({ reason: reason.trim() });
      }}
      className="rounded-md border border-border bg-card px-2 py-0.5 text-[11px] hover:bg-muted"
    >
      {on ? "Wait for their answers after all" : "Go ahead anyway"}
    </button>
  );
}

/**
 * "Send the rest to the customer": pick the questions, get the link. The
 * customer's page then shows what we know (to confirm) and what we still
 * need (to answer).
 */
function SendToCustomer({ deal, intake }: { deal: DealData; intake: IntakeAnswers }) {
  const qc = useQueryClient();
  const send = useServerFn(sendHandoffToCustomer);
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (open) {
      setPicked(
        intake.handoff.asked.length
          ? intake.handoff.asked.filter((k) => !isAnswered(answerValue(intake, k)))
          : defaultAsk(intake),
      );
      setUrl(null);
      setCopied(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const m = useMutation({
    mutationFn: () => send({ data: { dealId: deal.account.id, keys: picked } }),
    onSuccess: async (r) => {
      setUrl(r.url);
      try {
        await navigator.clipboard.writeText(r.url);
        setCopied(true);
      } catch {
        setCopied(false);
      }
      void qc.invalidateQueries({ queryKey: ["deal", deal.account.id] });
    },
  });
  const askable = HANDOFF_QUESTIONS.filter((q) => q.share);
  const sent = Boolean(intake.handoff.sent_to_customer_at);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2.5 py-1 text-[12px] hover:bg-muted"
      >
        <Send className="h-3 w-3" />{" "}
        {sent ? "Ask the customer again" : "Send the rest to the customer"}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-[14px]">What to ask the customer</DialogTitle>
            <DialogDescription className="text-[12px]">
              Their page will say “here is what we know so far” for the answers we have, and ask
              these. Unanswered questions are ticked; add any you want them to confirm.
            </DialogDescription>
          </DialogHeader>
          {url ? (
            <div className="space-y-2">
              <p className="text-[13px]">
                Sent. Their page now asks {picked.length} question{picked.length === 1 ? "" : "s"}.
                Share this link however you talk to them:
              </p>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={url}
                  className={inputClass}
                  onFocus={(e) => e.target.select()}
                />
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[12px] hover:bg-muted"
                  onClick={async () => {
                    await navigator.clipboard.writeText(url);
                    setCopied(true);
                  }}
                >
                  <Copy className="h-3 w-3" /> {copied ? "Copied" : "Copy"}
                </button>
              </div>
            </div>
          ) : (
            <ul className="max-h-[50vh] space-y-1 overflow-auto">
              {askable.map((q) => {
                const answered = isAnswered(answerValue(intake, q.key));
                const on = picked.includes(q.key);
                return (
                  <li key={q.key}>
                    <label className="flex items-start gap-2 rounded-sm px-1 py-1 text-[13px] hover:bg-muted/60">
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={on}
                        onChange={(e) =>
                          setPicked((p) =>
                            e.target.checked ? [...p, q.key] : p.filter((k) => k !== q.key),
                          )
                        }
                      />
                      <span>
                        {q.ask}
                        <span className="ml-1.5 text-[11px] text-muted-foreground">
                          {answered ? "answered — they confirm it" : "blank"}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
          <DialogFooter>
            {m.isError ? (
              <span className="mr-auto text-[12px] text-destructive">
                {m.error instanceof Error ? m.error.message : "Could not send."}
              </span>
            ) : null}
            <button
              type="button"
              className="rounded-md border border-border px-3 py-1.5 text-[12px] hover:bg-muted"
              onClick={() => setOpen(false)}
            >
              {url ? "Done" : "Cancel"}
            </button>
            {url ? null : (
              <button
                type="button"
                disabled={m.isPending || picked.length === 0}
                onClick={() => m.mutate()}
                className="rounded-md bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground disabled:opacity-50"
              >
                {m.isPending
                  ? "Sending…"
                  : `Send ${picked.length} question${picked.length === 1 ? "" : "s"}`}
              </button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
