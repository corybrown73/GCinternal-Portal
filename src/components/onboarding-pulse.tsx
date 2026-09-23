import { useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PlusCircle } from "lucide-react";

import { canEditDeal, useProfile } from "@/lib/auth";
import { startServicesDealFn } from "@/lib/deal-pulse.functions";

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
