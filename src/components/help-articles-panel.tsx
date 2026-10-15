import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BookOpen, ExternalLink, RefreshCw, X } from "lucide-react";

import { TONE } from "@/components/current-implementation-context";
import { Panel } from "@/components/record";
import { When } from "@/components/when";
import { dealQuery, type DealData } from "@/lib/deal-query";
import { readingInFlight } from "@/lib/stage-flow";
import {
  getHelpArticleStatus,
  repickHelpArticlesFn,
  syncHelpArticlesFn,
} from "@/lib/help.functions";
import { readIntake } from "@/lib/intake-answers";
import { saveIntake } from "@/lib/presale.functions";
import { getWelcome } from "@/lib/welcome.functions";
import { cn } from "@/lib/utils";

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
export function HelpPicksPanel({
  deal,
  editable,
  variant = "default",
}: {
  deal: DealData;
  editable: boolean;
  /** "resources" is the Customer 360 list: the same picks and actions, more compact. */
  variant?: "default" | "resources";
}) {
  const qc = useQueryClient();
  const intake = readIntake(deal.account.intake);
  const picks = intake.help_picks;
  const opens = useQuery({
    queryKey: ["welcome", deal.account.id],
    queryFn: () => getWelcome({ data: { dealId: deal.account.id } }),
  });
  // The picks land at the end of the AI's reading: follow the record while
  // it runs, wherever this panel is mounted, so "Nothing picked yet" is
  // never stale.
  useQuery({
    ...dealQuery(deal.account.id),
    refetchInterval: readingInFlight(intake.ai_reading) ? 4000 : false,
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
      level={variant === "resources" ? "primary" : "default"}
      title={
        variant === "resources"
          ? "Help articles for this implementation"
          : "Jump start your journey"
      }
      meta={
        variant === "resources"
          ? picks.length
            ? `${picks.length} picked · ${openedCount} opened`
            : "None picked yet"
          : picks.length
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
      {variant === "resources" ? (
        <ResourcePicks
          picks={picks}
          opened={opened}
          editable={editable}
          onTakeOff={(articleId) => remove.mutate(articleId)}
        />
      ) : picks.length === 0 ? (
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

type HelpPick = ReturnType<typeof readIntake>["help_picks"][number];

/**
 * The Resources list of picks. The same article, why, opened status and
 * take-off as the deal's panel; only the layout is tighter. Take off is shown
 * only where the default list shows its remove control.
 */
function ResourcePicks({
  picks,
  opened,
  editable,
  onTakeOff,
}: {
  picks: HelpPick[];
  opened: Record<string, string | null | undefined>;
  editable: boolean;
  onTakeOff: (articleId: string) => void;
}) {
  if (picks.length === 0) {
    return (
      <p className="px-3 py-3 text-[12px] text-muted-foreground">
        Pick again reads the brief and call notes and suggests help articles for the features
        discussed.
      </p>
    );
  }
  // Where the pick sits in the customer's journey, and whether a person added it.
  const tagsOf = (p: HelpPick) =>
    [p.feature, p.when, p.source === "person" ? "added by hand" : null].filter(Boolean);
  return (
    <ul className="divide-y divide-border">
      {picks.map((p) => (
        <li key={p.article_id} className="flex items-start gap-3 px-3 py-2.5 text-[12px]">
          <span
            className={cn(
              "mt-px flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
              TONE.warning.chip,
            )}
          >
            <BookOpen className="h-3.5 w-3.5" />
          </span>
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
            <p className="text-[11px] text-muted-foreground">
              {tagsOf(p).length ? `${tagsOf(p).join(" · ")} · ` : null}
              {opened[p.article_id] ? (
                <span className="text-status-ontrack-foreground">
                  Opened <When value={opened[p.article_id]} />
                </span>
              ) : (
                "Not opened yet"
              )}
            </p>
          </div>
          {editable ? (
            <button
              type="button"
              onClick={() => onTakeOff(p.article_id)}
              className="shrink-0 rounded-sm border border-border px-2 py-0.5 text-[11px] hover:bg-muted disabled:opacity-50"
            >
              Take off
            </button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
