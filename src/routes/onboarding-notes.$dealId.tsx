import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { speakerNotes } from "@/lib/welcome-notes";
import { getWelcome } from "@/lib/welcome.functions";

/**
 * The talk track for this customer's first call, as a printable document.
 * Internal only. Same data as the welcome page, so the dates and names in
 * the notes are the dates and names on the screens.
 */
export const Route = createFileRoute("/onboarding-notes/$dealId")({
  head: () => ({ meta: [{ title: "Speaker notes — GoCanvas Handoff Hub" }] }),
  component: NotesPage,
});

function NotesPage() {
  const { dealId } = Route.useParams();
  const load = useServerFn(getWelcome);
  const query = useQuery({
    queryKey: ["welcome", dealId],
    queryFn: () => load({ data: { dealId } }),
  });

  if (query.isPending) {
    return <p className="p-6 text-[13px] text-muted-foreground">Loading…</p>;
  }
  if (!query.data) {
    return (
      <div className="p-6 text-[13px]">
        <p>No such deal.</p>
        <Link to="/pipeline" className="underline">
          Back to the pipeline
        </Link>
      </div>
    );
  }
  const notes = speakerNotes(query.data);

  return (
    <div className="mx-auto max-w-3xl px-6 py-8 print:max-w-none print:px-0">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          to="/onboarding-plan/$dealId"
          params={{ dealId }}
          className="text-[12px] text-muted-foreground hover:text-foreground"
        >
          ← Back to the welcome page
        </Link>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-sm border border-border px-2 py-1 text-[12px] hover:bg-muted"
        >
          Print
        </button>
      </div>

      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
        Speaker notes · internal
      </p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">{notes.headline}</h1>
      <div className="mt-4 space-y-2">
        {notes.opener.map((line) => (
          <p key={line} className="text-[14px] leading-relaxed">
            {line}
          </p>
        ))}
      </div>

      <ol className="mt-8 space-y-8">
        {notes.sections.map((s) => (
          <li key={s.screen} className="break-inside-avoid">
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-primary">
              Screen {s.screen}
            </p>
            <h2 className="mt-0.5 text-lg font-semibold tracking-tight">{s.title}</h2>
            <p className="mt-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Say
            </p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-[14px] leading-relaxed">
              {s.say.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <p className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Why we do it this way
            </p>
            <p className="mt-1 border-l-2 border-primary/40 pl-3 text-[13px] leading-relaxed text-muted-foreground">
              {s.why}
            </p>
            {s.ifTheyAsk.length ? (
              <>
                <p className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  If they ask
                </p>
                <dl className="mt-1 space-y-2">
                  {s.ifTheyAsk.map((qa) => (
                    <div key={qa.q}>
                      <dt className="text-[13px] font-medium">&ldquo;{qa.q}&rdquo;</dt>
                      <dd className="text-[13px] leading-relaxed text-muted-foreground">{qa.a}</dd>
                    </div>
                  ))}
                </dl>
              </>
            ) : null}
          </li>
        ))}
      </ol>

      <div className="mt-8 rounded-md border border-border bg-muted/30 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          After the call
        </p>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-[14px] leading-relaxed">
          {notes.close.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
