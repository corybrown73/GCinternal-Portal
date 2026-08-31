import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { Panel, NoRows } from "@/components/record";
import { getSalesContext } from "@/lib/hub.functions";
import { fmtDate, humanize } from "@/lib/hub-format";

/**
 * What sales already knows, on the page where delivery works.
 *
 * THE GAP THIS FILLS. Everything the deal learned — why they bought, what was
 * said on the calls, the brief written off the back of them — lived on a
 * screen the implementation team had no reason to visit and, before the deal
 * link existed, no route to. So it got re-gathered by asking the customer
 * questions they had already answered.
 *
 * READ-ONLY, deliberately and visibly. These rows belong to the deal. Editing
 * them here would either fork the record or edit sales' notes behind their
 * back; both are worse than a link. Each entry is an excerpt and a way through
 * to the original.
 *
 * Renders NOTHING when the project has no deal. A permanent empty panel on
 * every project that was not sold through the pipeline is furniture, and
 * furniture is what people learn to scroll past.
 */
export function FromSalesPanel({ implementationId }: { implementationId: string }) {
  const q = useQuery({
    queryKey: ["sales-context", implementationId],
    queryFn: () => getSalesContext({ data: { implementationId } }),
  });

  if (q.isPending || q.isError) return null;
  const ctx = q.data;
  if (!ctx?.dealId) return null;

  const count = ctx.notes.length + ctx.reports.length + (ctx.brief ? 1 : 0);

  return (
    <Panel
      title="From sales"
      level="supporting"
      count={count}
      meta={ctx.dealName ? `Recorded on ${ctx.dealName}` : undefined}
      action={
        <Link
          to="/deals/$dealId"
          params={{ dealId: ctx.dealId }}
          className="text-[11px] underline hover:text-foreground"
        >
          Open the deal →
        </Link>
      }
    >
      {count === 0 && !ctx.summary ? (
        <NoRows label="The deal carries no notes, call reports or brief." />
      ) : (
        <div className="divide-y divide-border">
          {ctx.summary ? (
            <div className="px-3 py-2">
              <p className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                What the deal said
              </p>
              <p className="mt-0.5 text-[12px] leading-snug">{ctx.summary}</p>
            </div>
          ) : null}

          {ctx.notes.map((n) => (
            <div key={n.id} className="px-3 py-2">
              <p className="flex items-baseline gap-2 text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                <span>Sales note</span>
                <span className="font-mono normal-case tracking-normal">
                  {fmtDate(n.created_at)}
                </span>
                {n.review_status ? <span>{humanize(n.review_status)}</span> : null}
              </p>
              <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">{n.excerpt}</p>
            </div>
          ))}

          {ctx.reports.map((r) => (
            <div key={r.id} className="px-3 py-2">
              <p className="flex items-baseline gap-2 text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                <span>{r.report_type ? humanize(r.report_type) : "Call report"}</span>
                <span className="font-mono normal-case tracking-normal">
                  {fmtDate(r.created_at)}
                </span>
              </p>
              <p className="mt-0.5 text-[12px] font-medium">{r.title}</p>
              {r.excerpt ? (
                <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">{r.excerpt}</p>
              ) : null}
            </div>
          ))}

          {ctx.brief ? (
            <div className="px-3 py-2">
              <p className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                Account brief
              </p>
              <p className="mt-0.5 text-[12px]">
                {humanize(ctx.brief.status)} · {fmtDate(ctx.brief.created_at)}
                {/* The generator is load-bearing: a template-only brief looks
                    identical to a synthesised one, and the deal page already
                    says so rather than letting the reader assume. */}
                {ctx.brief.generator ? ` · ${humanize(ctx.brief.generator)}` : ""}
              </p>
            </div>
          ) : null}
        </div>
      )}
    </Panel>
  );
}
