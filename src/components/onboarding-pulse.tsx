import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, PlusCircle } from "lucide-react";

import { canEditDeal, useProfile } from "@/lib/auth";
import { DeliverablesStrip } from "@/components/deliverables-strip";
import { useToolMarks } from "@/lib/use-tool-marks";
import { getDealPulseFn, startServicesDealFn } from "@/lib/deal-pulse.functions";
import { cn } from "@/lib/utils";

/**
 * The customer record and the onboarding plan meet here.
 *
 * WHY. The plan, the clock and the guide all live on the deal; the work
 * lives on the customer. Somebody on the customer page had no way to know
 * the account was three days past its go-live without opening another
 * record. One strip: where it is on its clock, the next thing to do, and
 * the two links — the deal and the customer's page.
 */
export function OnboardingPulse({
  dealId,
  customerId,
  implId,
}: {
  dealId: string;
  /** When set, "next" opens the Pre-kickoff tab of this page instead of the deal route. */
  customerId?: string;
  implId?: string;
}) {
  const pulse = useQuery({
    queryKey: ["deal-pulse", dealId],
    queryFn: () => getDealPulseFn({ data: { dealId } }),
    refetchInterval: 30_000,
  });
  const toolMarks = useToolMarks();
  const p = pulse.data;
  if (!p) return null;
  const tone =
    p.counter.state === "live"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
      : p.counter.state === "past_due"
        ? "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300"
        : "border-primary/30 bg-primary/5 text-foreground";
  return (
    <div className="mx-6 mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-md border border-border bg-card px-3 py-2 text-[12px]">
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        Onboarding
      </span>
      <span
        className={cn("inline-flex items-baseline gap-2 rounded-full border px-2.5 py-0.5", tone)}
        title={p.counter.detail}
      >
        <b className="font-semibold">{p.counter.label}</b>
        <span className="text-muted-foreground">{p.counter.detail}</span>
      </span>
      <span className="text-muted-foreground">
        {p.path === "existing"
          ? "Existing account · services"
          : p.path === "dm_conversion"
            ? "Device Magic conversion · 7-day plan"
            : "New customer · 7-day plan"}{" "}
        · {p.done}/{p.total} set up
      </span>
      {p.next ? (
        customerId ? (
          <Link
            to="/customers/$customerId"
            params={{ customerId }}
            search={{ tab: "prekickoff", ...(implId ? { impl: implId } : {}) }}
            className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
            title={p.next.hint}
          >
            Next: {p.next.label} <ArrowRight className="h-3 w-3" />
          </Link>
        ) : (
          <Link
            to="/deals/$dealId"
            params={{ dealId }}
            className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
            title={p.next.hint}
          >
            Next: {p.next.label} <ArrowRight className="h-3 w-3" />
          </Link>
        )
      ) : (
        <span className="text-emerald-700 dark:text-emerald-400">Plan complete and shared.</span>
      )}
      {p.deliverables.length ? (
        <DeliverablesStrip
          phases={p.deliverables}
          size="sm"
          className="basis-full pt-1"
          overrides={toolMarks}
        />
      ) : null}
      <span className="ml-auto flex items-center gap-2">
        <Link
          to="/onboarding-plan/$dealId"
          params={{ dealId }}
          className="rounded-sm border border-border px-2 py-0.5 text-[11px] hover:bg-muted"
        >
          Welcome page
        </Link>
      </span>
    </div>
  );
}

/**
 * An existing customer buys services. One click starts the existing-account
 * path from their record: the closed-won deal, the link back here, the
 * assignment. Then it lands on the deal, where the guide takes over.
 */
export function AddServicesButton({ customerId }: { customerId: string }) {
  const { profile } = useProfile();
  const navigate = useNavigate();
  const start = useServerFn(startServicesDealFn);
  const m = useMutation({
    mutationFn: () => start({ data: { customerId } }),
    onSuccess: (r) => {
      // Straight to the services plan on this customer's page — the
      // Pre-kickoff tab of the implementation the deal just made — rather
      // than the deal URL, which only redirected back here.
      void navigate({
        to: "/customers/$customerId",
        params: { customerId },
        search: {
          tab: "prekickoff",
          ...(r.implementationId ? { impl: r.implementationId } : {}),
        },
      });
    },
  });
  if (!canEditDeal(profile?.role)) return null;
  return (
    <span className="inline-flex flex-col items-end">
      <button
        type="button"
        onClick={() => m.mutate()}
        disabled={m.isPending}
        className="inline-flex items-center gap-1 rounded-sm border border-primary/40 bg-card px-2 py-1 text-[11px] font-medium text-primary hover:bg-primary/5 disabled:opacity-60"
        title="They bought forms, an integration or training: start the services plan from this record"
      >
        <PlusCircle className="h-3 w-3" />
        {m.isPending ? "Starting…" : "Add services"}
      </button>
      {m.error ? (
        <span className="mt-1 text-[11px] text-destructive">{(m.error as Error).message}</span>
      ) : null}
    </span>
  );
}
