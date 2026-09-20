import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Mail } from "lucide-react";

import { Panel } from "@/components/record";
import { sendMyDigestFn } from "@/lib/digest.functions";

/**
 * The Monday digest, explained, with a button to see it now. The button
 * exists because "you will get an email on Monday" is not something anyone
 * can check on a Wednesday.
 */
export function DigestPanel() {
  const send = useServerFn(sendMyDigestFn);
  const m = useMutation({ mutationFn: () => send() });
  const r = m.data;
  return (
    <Panel title="Your Monday email" meta="Every Monday morning, to everyone with a book of work">
      <div className="space-y-2 px-4 py-3 text-[12.5px]">
        <p className="text-muted-foreground">
          What you owe this week, in one email: plan steps that are overdue, implementations that
          need action, what is due in the next seven days, and any deal nobody has claimed. Managers
          also get one row per owner. Same lists as Home, same words.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={m.isPending}
            onClick={() => m.mutate()}
            className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-card px-2.5 py-1 text-[12px] font-medium hover:bg-muted disabled:opacity-50"
          >
            <Mail className="h-3.5 w-3.5" /> {m.isPending ? "Composing…" : "Email me mine now"}
          </button>
          {m.isError ? (
            <span className="text-destructive">{(m.error as Error).message}</span>
          ) : r ? (
            <span
              className={
                r.emailed
                  ? "text-emerald-700 dark:text-emerald-400"
                  : "text-amber-800 dark:text-amber-300"
              }
            >
              {r.emailed
                ? `Sent: "${r.subject}".`
                : `Composed "${r.subject}" but the email did not send${r.reason ? ` (${r.reason})` : ""}.`}
            </span>
          ) : null}
        </div>
      </div>
    </Panel>
  );
}
