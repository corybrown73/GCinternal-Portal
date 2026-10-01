import { Link } from "@tanstack/react-router";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { CalendarDays, Check, Clock3, UserRound } from "lucide-react";

import { HandoffChip } from "@/components/handoff-chip";
import { PageBody, PageHeader } from "@/components/page";
import { salesHomeFor, type SalesRow, type SalesTone } from "@/lib/home-sales";
import { shortDay } from "@/lib/onboarding-timeline";
import { getPipeline } from "@/lib/presale.functions";
import { useScope } from "@/lib/use-scope";
import { cn } from "@/lib/utils";

const pipelineQuery = (scope: string | null) =>
  queryOptions({
    queryKey: ["pipeline", scope],
    queryFn: () => getPipeline({ data: scope ? { scope } : {} }),
  });

const TONE_TEXT: Record<SalesTone, string> = {
  critical: "text-[#b42318]",
  warning: "text-[#93500a]",
  info: "text-[#1c5cab]",
  good: "text-[#006300]",
  muted: "text-muted-foreground",
};
const TONE_DOT: Record<SalesTone, string> = {
  critical: "bg-[#d03b3b]",
  warning: "bg-[#fab219]",
  info: "bg-[#2a78d6]",
  good: "bg-[#0ca30c]",
  muted: "bg-border",
};

/**
 * The seller's Home. One row per deal in their book: where it is, the TIS,
 * the handoff, the first meeting, and the one thing on them next. The same
 * pipeline rows the board shows, so the two never disagree.
 */
export function SalesHome() {
  const { param } = useScope();
  const q = useQuery(pipelineQuery(param));
  const data = q.data;
  const home = data
    ? salesHomeFor(data.deals, {
        labels: new Map(data.stages.map((s) => [s.key, s.label])),
        order: new Map(data.stages.map((s) => [s.key, s.sort_order])),
        terminalKey: data.stages.find((s) => s.is_terminal)?.key ?? "onboarding_complete",
      })
    : null;
  return (
    <>
      <PageHeader
        size="lg"
        title="My deals"
        description="Where each deal is, who the TIS is, and what's on you before the handoff is done."
        hero={{ tagline: "A clean handoff is the first thing the customer feels." }}
      />
      <PageBody className="space-y-4">
        {home ? (
          <>
            <Tiles home={home} />
            <section className="rounded-lg border border-border bg-card" aria-label="My deals">
              <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 pt-3.5">
                <h2 className="text-[16px] font-semibold">
                  Deals <span className="text-muted-foreground">· {home.rows.length}</span>
                </h2>
                <Link to="/pipeline" className="text-[12px] text-primary hover:underline">
                  Open the board →
                </Link>
              </div>
              {home.rows.length ? (
                <ul className="mt-2 divide-y divide-border">
                  {home.rows.map((r) => (
                    <DealRow key={r.id} row={r} />
                  ))}
                </ul>
              ) : (
                <p className="px-4 py-6 text-[13px] text-muted-foreground">
                  No deals in your book yet. Add one from the Pipeline; it shows up here with its
                  handoff and its TIS.
                </p>
              )}
            </section>
          </>
        ) : q.isError ? (
          <p className="text-[13px] text-destructive">The deals could not be loaded.</p>
        ) : (
          <p className="text-[13px] text-muted-foreground">Loading your deals…</p>
        )}
      </PageBody>
    </>
  );
}

function Tiles({ home }: { home: ReturnType<typeof salesHomeFor> }) {
  const tiles: Array<{
    label: string;
    sub: string;
    value: number;
    tone: SalesTone;
    icon: typeof Check;
  }> = [
    {
      label: "Needs a TIS",
      sub: "At Negotiate & Finalize",
      value: home.tiles.needsTis,
      tone: "critical",
      icon: UserRound,
    },
    {
      label: "Handoff outstanding",
      sub: "What the TIS needs from you",
      value: home.tiles.handoffOpen,
      tone: "warning",
      icon: Clock3,
    },
    {
      label: "First meeting not booked",
      sub: "Book it on the closing call",
      value: home.tiles.noFirstMeeting,
      tone: "info",
      icon: CalendarDays,
    },
    {
      label: "Closed, before kickoff",
      sub: "With implementation",
      value: home.tiles.closedNotKickedOff,
      tone: "good",
      icon: Check,
    },
  ];
  const wash: Record<SalesTone, string> = {
    critical: "bg-[#fdeceb]",
    warning: "bg-[#fff6e5]",
    info: "bg-[#eaf2fc]",
    good: "bg-[#f1f7f1]",
    muted: "bg-muted",
  };
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {tiles.map((tile) => {
        const Icon = tile.icon;
        return (
          <div
            key={tile.label}
            className={cn("flex items-center gap-3 rounded-lg px-4 py-3.5", wash[tile.tone])}
          >
            <span
              className={cn(
                "flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/80",
                TONE_TEXT[tile.tone],
              )}
            >
              <Icon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-[26px] font-semibold leading-none tracking-tight">{tile.value}</p>
              <p className="mt-1 text-[13px] font-medium leading-tight">{tile.label}</p>
              <p className="text-[11px] text-muted-foreground">{tile.sub}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DealRow({ row }: { row: SalesRow }) {
  const inner = (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 hover:bg-muted/50">
      <span className={cn("h-2 w-2 shrink-0 rounded-full", TONE_DOT[row.next.tone])} />
      <span className="min-w-[180px] flex-1 truncate text-[13px] font-medium">{row.name}</span>
      <span className="w-36 text-[12px] text-muted-foreground">{row.stageLabel}</span>
      <span className="w-40 truncate text-[12px]">
        <span className="text-muted-foreground">TIS </span>
        {row.tis ?? <span className="text-[#b42318]">none yet</span>}
      </span>
      <span className="w-44">
        {row.handoff ? <HandoffChip status={row.handoff} size="sm" /> : null}
      </span>
      <span className="w-40 text-[12px]">
        <span className="text-muted-foreground">First meeting </span>
        {row.firstMeeting ? shortDay(row.firstMeeting) : "—"}
      </span>
      <span className={cn("w-full text-[12px] sm:w-auto sm:flex-1", TONE_TEXT[row.next.tone])}>
        {row.next.text}
      </span>
    </div>
  );
  return (
    <li>
      {row.href.kind === "deal" ? (
        <Link to="/deals/$dealId" params={{ dealId: row.href.dealId }} className="block">
          {inner}
        </Link>
      ) : (
        <Link
          to="/customers/$customerId"
          params={{ customerId: row.href.customerId }}
          search={row.href.implId ? { impl: row.href.implId } : {}}
          className="block"
        >
          {inner}
        </Link>
      )}
    </li>
  );
}
