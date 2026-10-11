import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check } from "lucide-react";

import type { DealData } from "@/lib/deal-query";
import { listCustomerOptions } from "@/lib/hub.functions";
import type { IntakeAnswers } from "@/lib/intake-answers";
import { getHandoffOptions, linkExistingCustomerFn } from "@/lib/presale.functions";
import { cn } from "@/lib/utils";

/**
 * "Existing account" on the deal page: which customer is it? Search by
 * name, pick one, and the close joins the implementation to that customer
 * — the way "Add services" does — instead of making a second one.
 */
export function ExistingCustomerLink({
  deal,
  intake,
  editable,
}: {
  deal: DealData;
  intake: IntakeAnswers;
  editable: boolean;
}) {
  const qc = useQueryClient();
  const link = useServerFn(linkExistingCustomerFn);
  const [query, setQuery] = useState("");
  const [changing, setChanging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const options = useQuery({
    queryKey: ["customer-options"],
    queryFn: () => listCustomerOptions(),
    staleTime: 60_000,
  });
  // Whether the close honours the pick at all: with \`account_model\` off it
  // starts a new customer whatever is picked. Same query as the deal's
  // handoff panel, so it is usually cached already.
  const handoff = useQuery({
    queryKey: ["handoff-options", deal.account.id],
    queryFn: () => getHandoffOptions({ data: { dealId: deal.account.id } }),
    staleTime: 60_000,
  });
  const m = useMutation({
    mutationFn: (customerId: string | null) =>
      link({ data: { dealId: deal.account.id, customerId } }),
    onMutate: () => setError(null),
    onSuccess: () => {
      setChanging(false);
      setQuery("");
      void qc.invalidateQueries({ queryKey: ["deal", deal.account.id] });
      void qc.invalidateQueries({ queryKey: ["welcome", deal.account.id] });
    },
    onError: (e) => setError((e as Error).message),
  });

  const customers = options.data?.customers ?? [];
  const picked = intake.existing_customer_id
    ? (customers.find((c) => c.id === intake.existing_customer_id) ?? null)
    : null;
  const q = query.trim().toLowerCase();
  const hits = q ? customers.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 8) : [];

  if (intake.existing_customer_id && !changing) {
    return (
      <p className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-[12px]">
        <Check className="h-3.5 w-3.5 text-primary" strokeWidth={3} />
        <span>
          {handoff.data?.flagOn === false ? "Picked " : "Adds to "}
          <b>
            {picked?.name ??
              (options.isPending
                ? "…"
                : options.isError
                  ? "the customer picked (the list did not load)"
                  : "a customer no longer listed")}
          </b>
          {handoff.data?.flagOn === false
            ? ", but the close still starts a new customer for now (the account model is off) — merge it into theirs afterwards."
            : " when the deal is marked Closed Won here. A close that comes from Salesforce starts a new customer, to be merged into theirs."}
        </span>
        {editable ? (
          <button
            type="button"
            className="underline text-muted-foreground hover:text-foreground"
            onClick={() => setChanging(true)}
          >
            Change
          </button>
        ) : null}
        {error ? <span className="w-full text-destructive">{error}</span> : null}
      </p>
    );
  }

  return (
    <div className="space-y-1.5 rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-[12px]">
      <label className="block font-medium" htmlFor={`existing-customer-${deal.account.id}`}>
        Which customer is this for?
      </label>
      <p className="text-[11px] text-muted-foreground">
        Pick them so marking it Closed Won here adds this to their record instead of starting a
        second customer.
      </p>
      <input
        id={`existing-customer-${deal.account.id}`}
        className="h-8 w-full rounded-sm border border-border bg-background px-2 text-[12px] focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={
          options.isPending
            ? "Loading customers…"
            : options.isError
              ? "Could not load customers"
              : "Search customers by name"
        }
        disabled={!editable || m.isPending}
        autoComplete="off"
      />
      {options.isError ? (
        <p className="text-destructive">
          Could not load the customers.{" "}
          <button
            type="button"
            className="underline"
            disabled={options.isFetching}
            onClick={() => void options.refetch()}
          >
            {options.isFetching ? "Trying…" : "Try again"}
          </button>
        </p>
      ) : q ? (
        hits.length ? (
          <ul className="divide-y divide-border rounded-sm border border-border bg-background">
            {hits.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className={cn(
                    "flex w-full items-center justify-between px-2 py-1.5 text-left hover:bg-muted disabled:opacity-60",
                  )}
                  disabled={!editable || m.isPending}
                  onClick={() => m.mutate(c.id)}
                >
                  <span>{c.name}</span>
                  {c.industry ? (
                    <span className="text-[11px] text-muted-foreground">{c.industry}</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            No customer by that name. Not one of ours yet? Pick “New logo” instead.
          </p>
        )
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        {changing ? (
          <button
            type="button"
            className="underline text-muted-foreground hover:text-foreground"
            onClick={() => setChanging(false)}
          >
            Keep {picked?.name ?? "the current one"}
          </button>
        ) : null}
        {changing && editable ? (
          <button
            type="button"
            className="underline text-muted-foreground hover:text-foreground"
            disabled={m.isPending}
            onClick={() => m.mutate(null)}
          >
            Clear it
          </button>
        ) : null}
        {m.isPending ? <span className="text-muted-foreground">Saving…</span> : null}
      </div>
      {error ? <p className="text-destructive">{error}</p> : null}
    </div>
  );
}
