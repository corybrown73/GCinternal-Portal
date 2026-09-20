import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react";

import { MarkRow } from "@/components/deliverables-strip";
import { getPastImplementationsFn } from "@/lib/past-implementations.functions";
import { useToolMarks } from "@/lib/use-tool-marks";
import { cn } from "@/lib/utils";

function shortDay(iso: string): string {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * The customer's earlier projects, one tile each: when it went live, how
 * long it took against the plan, who ran it, what was built. Click one to
 * open it in the same tabs. Renders nothing for a customer on their first.
 */
export function PastImplementations({
  customerId,
  activeImplementationId,
}: {
  customerId: string;
  activeImplementationId: string | null;
}) {
  const q = useQuery({
    queryKey: ["past-implementations", customerId, activeImplementationId],
    queryFn: () => getPastImplementationsFn({ data: { customerId, activeImplementationId } }),
    staleTime: 60_000,
  });
  const toolMarks = useToolMarks();
  const rows = q.data ?? [];
  if (rows.length === 0) return null;
  return (
    <section className="px-6 pt-3" aria-label="Earlier projects on this customer">
      <h2 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        Earlier projects
      </h2>
      <ul className="mt-1.5 flex flex-wrap gap-2.5">
        {rows.map((r) => {
          const pace =
            r.over_by === null
              ? null
              : r.over_by <= 0
                ? "on plan"
                : `${r.over_by} day${r.over_by === 1 ? "" : "s"} over plan`;
          return (
            <li key={r.id}>
              <Link
                to="/customers/$customerId"
                params={{ customerId }}
                search={{ impl: r.id }}
                className={cn(
                  "block w-64 rounded-md border border-border bg-card px-3 py-2.5 hover:bg-muted/40",
                )}
              >
                <p className="flex items-center gap-1.5 truncate text-[12.5px] font-semibold">
                  {r.complete || r.stage === "graduate-to-cs" ? (
                    <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" strokeWidth={3} />
                  ) : null}
                  <span className="truncate">{r.name}</span>
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {r.live_on ? `Live ${shortDay(r.live_on)}` : "Launched"}
                  {r.actual_days !== null ? ` · ${r.actual_days} business days` : ""}
                  {pace ? `, ${pace}` : ""}
                </p>
                <p className="text-[11px] text-muted-foreground">{r.owner_name ?? "Unassigned"}</p>
                {r.marks.length ? (
                  <MarkRow marks={r.marks} className="mt-1.5" overrides={toolMarks} max={8} />
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
