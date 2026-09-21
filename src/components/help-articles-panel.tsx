import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BookOpen, ExternalLink, RefreshCw, X } from "lucide-react";

import { Panel } from "@/components/record";
import { When } from "@/components/when";
import type { DealData } from "@/lib/deal-query";
import {
  getHelpArticleStatus,
  repickHelpArticlesFn,
  syncHelpArticlesFn,
} from "@/lib/help.functions";
import { readIntake } from "@/lib/intake-answers";
import { saveIntake } from "@/lib/presale.functions";
import { getWelcome } from "@/lib/welcome.functions";

/**
 * Settings: the help-article library. How many, when it was refreshed, and
 * a button to refresh it from the help centre. Managers only.
 */
export function HelpArticlesSettings({ canManage }: { canManage: boolean }) {
  const qc = useQueryClient();
  const status = useQuery({ queryKey: ["help-articles"], queryFn: () => getHelpArticleStatus() });
  const sync = useServerFn(syncHelpArticlesFn);
  const [note, setNote] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: () => sync(),
    onSuccess: (r) => {
      setNote(
        r.source === "help_center"
          ? `${r.count} articles, fresh from the help centre.`
          : (r.note ?? `${r.count} articles from the bundled index.`),
      );
      void qc.invalidateQueries({ queryKey: ["help-articles"] });
    },
    onError: (e) => setNote((e as Error).message),
  });
  return (
    <section className="overflow-hidden rounded-md border border-border bg-card">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-4 py-2.5">
        <div>
          <h2 className="text-[13px] font-semibold">Help articles</h2>
          <p className="mt-0.5 text-[11.5px] text-muted-foreground">
            The GoCanvas help centre, as the library the customer&apos;s page picks from. Refreshed
            from help.gocanvas.com; the bundled index stands in when it cannot be reached.
          </p>
        </div>
        {canManage ? (
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-sm border border-border px-2.5 py-1 text-[12px] font-medium hover:bg-muted disabled:opacity-50"
            disabled={m.isPending}
            onClick={() => m.mutate()}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {m.isPending ? "Refreshing…" : "Refresh from the help centre"}
          </button>
        ) : null}
      </header>
      <div className="px-4 py-2.5 text-[12px] text-muted-foreground">
        {status.data
          ? status.data.count
            ? `${status.data.count} articles · last refreshed ${status.data.syncedAt ? status.data.syncedAt.slice(0, 10) : "—"}`
            : "No articles yet. The library seeds itself from the bundled index the first time a brief is written, or press Refresh."
          : "Loading…"}
        {note ? <p className="mt-1 text-foreground">{note}</p> : null}
      </div>
    </section>
  );
}

/**
 * The deal: the articles picked for this customer, whether they opened
 * them, and the two things a person can do — take one off, or pick again.
 */
export function HelpPicksPanel({ deal, editable }: { deal: DealData; editable: boolean }) {
  const qc = useQueryClient();
  const intake = readIntake(deal.account.intake);
  const picks = intake.help_picks;
  const opens = useQuery({
    queryKey: ["welcome", deal.account.id],
    queryFn: () => getWelcome({ data: { dealId: deal.account.id } }),
  });
  const save = useServerFn(saveIntake);
  const repick = useServerFn(repickHelpArticlesFn);
  const [error, setError] = useState<string | null>(null);
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["deal", deal.account.id] });
    void qc.invalidateQueries({ queryKey: ["welcome", deal.account.id] });
  };
  const remove = useMutation({
    mutationFn: (articleId: string) =>
      save({
        data: {
          dealId: deal.account.id,
          patch: { help_picks: picks.filter((p) => p.article_id !== articleId) },
        } as never,
      }),
    onMutate: () => setError(null),
    onSuccess: invalidate,
    onError: (e) => setError((e as Error).message),
  });
  const again = useMutation({
    mutationFn: () => repick({ data: { dealId: deal.account.id } }),
    onMutate: () => setError(null),
    onSuccess: invalidate,
    onError: (e) => setError((e as Error).message),
  });
  const opened = opens.data?.helpOpened ?? {};
  const openedCount = picks.filter((p) => opened[p.article_id]).length;
  return (
    <Panel
      id="panel-help"
      title="Jump start your journey"
      meta={
        picks.length
          ? `${picks.length} help article${picks.length === 1 ? "" : "s"} on the customer's page · ${openedCount} opened`
          : "Help articles for the key features the calls discussed — press Pick again"
      }
      collapsible
      defaultOpen
      collapseKey="deal:help"
      action={
        editable ? (
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-sm border border-border px-2 py-0.5 text-[11px] hover:bg-muted disabled:opacity-50"
            disabled={again.isPending}
            onClick={() => again.mutate()}
            title="Pick again from the latest brief and notes. Articles you added yourself stay."
          >
            <RefreshCw className="h-3 w-3" />
            {again.isPending ? "Picking…" : "Pick again"}
          </button>
        ) : null
      }
    >
      {picks.length === 0 ? (
        <p className="px-3 py-2 text-[12px] text-muted-foreground">
          Nothing picked yet. Press Pick again: the picker reads the brief and the call notes for
          the key features your team discussed with them, and puts the help articles on their page
          as &ldquo;Jump start your journey&rdquo;.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {picks.map((p) => (
            <li key={p.article_id} className="flex items-start gap-2 px-3 py-2 text-[12px]">
              <BookOpen className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <a
                  href={p.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="font-medium hover:underline"
                >
                  {p.title} <ExternalLink className="inline h-3 w-3 text-muted-foreground" />
                </a>
                {p.why ? <p className="text-muted-foreground">{p.why}</p> : null}
                {p.feature || p.when ? (
                  <p className="text-[11px] text-muted-foreground">
                    {[p.feature, p.when].filter(Boolean).join(" · ")}
                  </p>
                ) : null}
                <p className="mt-0.5 text-[11px]">
                  {opened[p.article_id] ? (
                    <span className="text-status-ontrack-foreground">
                      Opened <When value={opened[p.article_id]} />
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Not opened yet</span>
                  )}
                  {p.source === "person" ? (
                    <span className="text-muted-foreground"> · added by hand</span>
                  ) : null}
                </p>
              </div>
              {editable ? (
                <button
                  type="button"
                  className="rounded-sm p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  title="Take this one off the customer's page"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(p.article_id)}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {error ? (
        <p role="alert" className="px-3 py-2 text-[12px] text-destructive">
          {error}
        </p>
      ) : null}
    </Panel>
  );
}
