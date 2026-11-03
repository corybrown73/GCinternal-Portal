import { useState } from "react";
import { Copy, Loader2, RefreshCw } from "lucide-react";

import { ask } from "@/components/ui/ask";
import {
  followupEmailText,
  followupWordCount,
  isFollowupEdited,
  WORD_GUIDE,
  type FollowupDraft,
} from "@/lib/transcript-followup";
import { cn } from "@/lib/utils";

/**
 * The reading a follow-up email belongs to: the transcript it came from, and
 * its draft when one exists. The heading names the transcript, so a reviewer
 * always knows which meeting the email is for.
 */
export type FollowupSource = {
  attachment_id: string;
  title: string | null;
  at: string | null;
  draft: FollowupDraft | null;
};

const SECONDARY =
  "inline-flex items-center gap-1.5 rounded-sm border border-border px-2.5 py-1 text-[12px] text-foreground hover:bg-muted disabled:opacity-50";
const PRIMARY =
  "inline-flex items-center gap-1.5 rounded-sm border border-primary/40 bg-primary/10 px-2.5 py-1 text-[12px] font-medium text-primary hover:bg-primary/15 disabled:opacity-50";
const FIELD =
  "w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-[12px] text-foreground outline-none focus:ring-1 focus:ring-ring disabled:opacity-60";

/**
 * The suggested follow-up email, below the transcript's readings. Shows the
 * draft for review, lets the reviewer edit it, copy it, or ask for a fresh
 * one. It sends nothing and writes nothing to the implementation.
 */
export function FollowupEmailSection({
  source,
  from,
  drafting,
  error,
  onDraft,
}: {
  source: FollowupSource;
  /** The transcript's name and day, as the heading says where the email came from. */
  from: string;
  drafting: boolean;
  error: string | null;
  onDraft: (source: FollowupSource) => void;
}) {
  const draft = source.draft;
  return (
    <div className="space-y-2 border-t border-border pt-3" aria-label="Suggested follow-up email">
      <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        Suggested follow-up email
      </div>
      <p className="text-[11px] text-muted-foreground">From {from}. Nothing is sent from here.</p>

      {drafting ? (
        <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Drafting the email…
        </p>
      ) : draft?.status === "ready" ? (
        <FollowupEditor
          key={draft.generated_at}
          draft={draft}
          onRegenerate={() => onDraft(source)}
        />
      ) : draft?.status === "unreadable" ? (
        <p className="text-[12px] text-muted-foreground">
          {draft.problem ?? "No follow-up email could be drafted from this transcript."}
        </p>
      ) : draft?.status === "failed" ? (
        <div className="space-y-1.5">
          <p className="text-[12px] text-destructive">{draft.problem}</p>
          <button type="button" onClick={() => onDraft(source)} className={SECONDARY}>
            <RefreshCw className="h-3 w-3" />
            Try again
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => onDraft(source)} className={PRIMARY}>
          Draft follow-up email
        </button>
      )}

      {error ? <p className="text-[12px] text-destructive">{error}</p> : null}
    </div>
  );
}

/**
 * The draft as editable text. Keyed by the draft's generation time by the
 * caller, so a fresh draft starts from its own text and never from the last
 * one's edits.
 */
function FollowupEditor({
  draft,
  onRegenerate,
}: {
  draft: FollowupDraft;
  onRegenerate: () => void;
}) {
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const email = { subject, body };
  const edited = isFollowupEdited(draft, email);
  const words = followupWordCount(body);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(followupEmailText(email));
      setCopied(true);
      setCopyError(null);
    } catch {
      setCopied(false);
      setCopyError("Could not copy from here. Select the text and copy it.");
    }
  };

  const reset = () => {
    setSubject(draft.subject);
    setBody(draft.body);
    setCopied(false);
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
    onRegenerate();
  };

  return (
    <div className="space-y-2">
      {draft.withheld > 0 ? (
        <p className="text-[11px] text-amber-800 dark:text-amber-300">
          {draft.withheld === 1 ? "One point was" : `${draft.withheld} points were`} left out
          because the transcript marked it internal. Check the rest before you copy it.
        </p>
      ) : null}

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
          rows={14}
          aria-label="Email body"
          className={cn(FIELD, "resize-y")}
        />
        <span
          className={cn(
            "block text-[11px]",
            words > WORD_GUIDE ? "text-amber-800 dark:text-amber-300" : "text-muted-foreground",
          )}
        >
          About {words} words
          {words > WORD_GUIDE
            ? `. Over the ${WORD_GUIDE}-word guide: trim it before you copy it.`
            : "."}
        </span>
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => void copy()} className={PRIMARY}>
          <Copy className="h-3 w-3" />
          {copied ? "Copied" : "Copy email"}
        </button>
        {edited ? (
          <button type="button" onClick={reset} className={SECONDARY}>
            Reset to suggestion
          </button>
        ) : null}
        <button type="button" onClick={() => void regenerate()} className={SECONDARY}>
          <RefreshCw className="h-3 w-3" />
          Regenerate
        </button>
        {copyError ? <span className="text-[11px] text-destructive">{copyError}</span> : null}
      </div>

      <p className="text-[11px] text-muted-foreground">
        Add your name, check each point against the meeting, and send it from your own mail. To
        change the helpful resources, edit or delete their lines in the body. Links come only from
        the GoCanvas help centre.
      </p>
    </div>
  );
}
