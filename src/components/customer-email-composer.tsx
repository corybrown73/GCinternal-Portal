import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Loader2, Mail, RefreshCw } from "lucide-react";

import { ask } from "@/components/ui/ask";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  closeNeedsConfirm,
  CUSTOMER_EMAIL_TYPE_LABEL,
  CUSTOMER_EMAIL_TYPES,
  emailCopyText,
  includedResources,
  INSTRUCTIONS_MAX,
  wordStatus,
  type CustomerEmailDraft,
  type CustomerEmailType,
} from "@/lib/customer-email";
import { draftCustomerEmailFn, pendingTranscriptWork } from "@/lib/hub.functions";
import { cn } from "@/lib/utils";

const PRIMARY =
  "inline-flex items-center gap-1.5 rounded-sm border border-primary/40 bg-primary/10 px-2.5 py-1 text-[12px] font-medium text-primary hover:bg-primary/15 disabled:opacity-50";
const SECONDARY =
  "inline-flex items-center gap-1.5 rounded-sm border border-border px-2.5 py-1 text-[12px] text-foreground hover:bg-muted disabled:opacity-50";
const FIELD =
  "w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-[12px] text-foreground outline-none focus:ring-1 focus:ring-ring disabled:opacity-60";

/**
 * "Draft an email" on Customer 360. The specialist picks the kind of email,
 * optionally says what they want it to do, and gets an editable draft to copy.
 * Nothing is sent and nothing is stored: the draft lives in this dialog for
 * the session. Customer View links are not generated; a specialist who wants
 * one pastes a link they have already issued into the body.
 */
export function CustomerEmailComposer({
  customerId,
  implementationId,
  implementationName,
}: {
  customerId: string;
  implementationId: string;
  implementationName: string;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"compose" | "review">("compose");
  const [type, setType] = useState<CustomerEmailType>("check_in");
  const [instructions, setInstructions] = useState("");
  const [attachmentId, setAttachmentId] = useState("");
  const [draft, setDraft] = useState<CustomerEmailDraft | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [unticked, setUnticked] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);

  const draftFn = useServerFn(draftCustomerEmailFn);
  const workFn = useServerFn(pendingTranscriptWork);
  // The same query the transcript panel reads, so a reading finished there is listed here.
  const transcripts = useQuery({
    queryKey: ["transcript-work", implementationId],
    queryFn: () => workFn({ data: { implementationId } }),
    enabled: open && type === "meeting_followup",
  });
  const readings = transcripts.data?.followups ?? [];

  const generate = useMutation({
    mutationFn: async () => {
      const out = await draftFn({
        data: {
          customerId,
          implementationId,
          type,
          instructions: instructions.trim() || null,
          attachmentId: type === "meeting_followup" ? attachmentId || null : null,
        },
      });
      return out.draft;
    },
    onSuccess: (d) => {
      setDraft(d);
      setSubject(d.subject);
      setBody(d.body);
      setUnticked(new Set());
      setCopied(false);
      setCopyError(null);
      setStep("review");
    },
  });

  const edited = draft !== null && closeNeedsConfirm(draft, { subject, body });

  const reset = () => {
    setStep("compose");
    setDraft(null);
    setSubject("");
    setBody("");
    setUnticked(new Set());
    setCopied(false);
    setCopyError(null);
    generate.reset();
  };

  // Closing discards an edited email, so it is confirmed first.
  const requestOpenChange = async (next: boolean) => {
    if (next) {
      setOpen(true);
      return;
    }
    if (edited) {
      const confirmed = await ask({
        title: "Discard this email?",
        body: "Your edits will be lost. Nothing has been sent or saved.",
        confirmLabel: "Discard",
        destructive: true,
      });
      if (confirmed !== true) return;
    }
    setOpen(false);
    reset();
  };

  const regenerate = async () => {
    if (edited) {
      const confirmed = await ask({
        title: "Replace your edits with a new draft?",
        body: "Your changes to the subject and body will be lost.",
        confirmLabel: "Replace",
        destructive: true,
      });
      if (confirmed !== true) return;
    }
    generate.mutate();
  };

  const copy = async () => {
    const text = emailCopyText(
      { subject, body },
      includedResources(draft?.resources ?? [], unticked),
    );
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setCopyError(null);
    } catch {
      setCopied(false);
      setCopyError("Could not copy from here. Select the text and copy it.");
    }
  };

  const meetingNeedsTranscript = type === "meeting_followup" && !attachmentId;
  const status = draft ? wordStatus(body, type) : null;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={cn(PRIMARY, "text-[12px]")}>
        <Mail className="h-3 w-3" />
        Draft an email
      </button>

      <Dialog open={open} onOpenChange={(next) => void requestOpenChange(next)}>
        <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Draft an email</DialogTitle>
            <DialogDescription>
              {implementationName}. Nothing is sent from here, and the draft is kept only while this
              window is open.
            </DialogDescription>
          </DialogHeader>

          {step === "compose" ? (
            <div className="space-y-4">
              <fieldset className="space-y-1.5">
                <legend className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  What kind of email?
                </legend>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {CUSTOMER_EMAIL_TYPES.map((t) => (
                    <label
                      key={t}
                      className={cn(
                        "flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-2 text-[12px]",
                        type === t ? "border-primary/60 bg-primary/5" : "border-border",
                      )}
                    >
                      <input
                        type="radio"
                        name="customer-email-type"
                        value={t}
                        checked={type === t}
                        onChange={() => setType(t)}
                        className="h-3 w-3"
                      />
                      {CUSTOMER_EMAIL_TYPE_LABEL[t]}
                    </label>
                  ))}
                </div>
              </fieldset>

              {type === "meeting_followup" ? (
                <label className="block space-y-1">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    Which meeting?
                  </span>
                  {readings.length ? (
                    <select
                      value={attachmentId}
                      onChange={(e) => setAttachmentId(e.target.value)}
                      className={cn(FIELD, "h-8")}
                    >
                      <option value="">Choose a transcript…</option>
                      {readings.map((r) => (
                        <option key={r.attachment_id} value={r.attachment_id}>
                          {r.title ?? "Meeting transcript"}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p className="text-[12px] text-muted-foreground">
                      {transcripts.isPending
                        ? "Loading the meetings…"
                        : "No finished meeting transcript on this implementation yet. Read one in the meeting panel first."}
                    </p>
                  )}
                </label>
              ) : null}

              <label className="block space-y-1">
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  What would you like to say?{" "}
                  <span className="font-normal normal-case">(optional)</span>
                </span>
                <textarea
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  maxLength={INSTRUCTIONS_MAX}
                  rows={4}
                  placeholder="For example: I want to check how testing is going, remind them about the form changes, and ask whether they're ready for our next session."
                  aria-label="What would you like to say"
                  className={cn(FIELD, "resize-y")}
                />
                <span className="block text-[11px] text-muted-foreground">
                  This guides the emphasis and tone. It cannot add facts to the email.
                </span>
              </label>

              {generate.isError ? (
                <p className="text-[12px] text-destructive">{(generate.error as Error).message}</p>
              ) : null}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={meetingNeedsTranscript || generate.isPending}
                  onClick={() => generate.mutate()}
                  className={PRIMARY}
                >
                  {generate.isPending ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Mail className="h-3 w-3" />
                  )}
                  {generate.isPending ? "Drafting…" : "Generate email"}
                </button>
              </div>
            </div>
          ) : draft && draft.status !== "ready" ? (
            <div className="space-y-3">
              <p
                className={cn(
                  "text-[12px]",
                  draft.status === "failed" ? "text-destructive" : "text-muted-foreground",
                )}
              >
                {draft.problem}
              </p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => generate.mutate()} className={SECONDARY}>
                  <RefreshCw className="h-3 w-3" />
                  Try again
                </button>
                <button type="button" onClick={() => setStep("compose")} className={SECONDARY}>
                  Change instructions
                </button>
              </div>
            </div>
          ) : draft ? (
            <div className="space-y-3">
              <p className="text-[11px] text-muted-foreground">{draft.context_summary}</p>

              <label className="block space-y-1">
                <span className="text-[11px] text-muted-foreground">Subject</span>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => {
                    setSubject(e.target.value);
                    setCopied(false);
                  }}
                  aria-label="Email subject"
                  className={cn(FIELD, "h-8")}
                />
              </label>

              <label className="block space-y-1">
                <span className="text-[11px] text-muted-foreground">Body</span>
                <textarea
                  value={body}
                  onChange={(e) => {
                    setBody(e.target.value);
                    setCopied(false);
                  }}
                  rows={12}
                  aria-label="Email body"
                  className={cn(FIELD, "resize-y")}
                />
                {status ? (
                  <span
                    className={cn(
                      "block text-[11px]",
                      status.level === "ok"
                        ? "text-muted-foreground"
                        : "text-amber-800 dark:text-amber-300",
                    )}
                  >
                    About {status.words} words{status.message ? `. ${status.message}` : "."}
                  </span>
                ) : null}
              </label>

              {draft.resources.length ? (
                <fieldset className="space-y-1.5">
                  <legend className="text-[11px] text-muted-foreground">
                    Helpful resources from the GoCanvas help centre (untick any to leave out)
                  </legend>
                  {draft.resources.map((r) => (
                    <label key={r.url} className="flex items-start gap-2 text-[12px]">
                      <input
                        type="checkbox"
                        className="mt-0.5 h-3 w-3"
                        checked={!unticked.has(r.url)}
                        onChange={(e) => {
                          setUnticked((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.delete(r.url);
                            else next.add(r.url);
                            return next;
                          });
                          setCopied(false);
                        }}
                      />
                      <span>
                        <span className="font-medium text-foreground">{r.title}</span>
                        <span className="block text-[11px] text-muted-foreground">{r.why}</span>
                      </span>
                    </label>
                  ))}
                </fieldset>
              ) : null}

              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => void copy()} className={PRIMARY}>
                  <Copy className="h-3 w-3" />
                  {copied ? "Copied" : "Copy email"}
                </button>
                <button
                  type="button"
                  disabled={generate.isPending}
                  onClick={() => void regenerate()}
                  className={SECONDARY}
                >
                  <RefreshCw className="h-3 w-3" />
                  {generate.isPending ? "Drafting…" : "Regenerate"}
                </button>
                <button type="button" onClick={() => setStep("compose")} className={SECONDARY}>
                  Change instructions
                </button>
                {copyError ? (
                  <span className="text-[11px] text-destructive">{copyError}</span>
                ) : null}
              </div>

              <p className="text-[11px] text-muted-foreground">
                Check each point against the record, add your name, and send it from your own mail.
                To include a Customer View link, paste one you have already issued into the body. It
                is not generated or checked here.
              </p>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
