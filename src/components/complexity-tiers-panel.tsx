import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import type { ComplexityTier } from "@/lib/complexity-tiers";
import { getComplexityTiers, setComplexityTiers } from "@/lib/complexity-tiers.functions";

const inputClass =
  "h-7 w-full rounded-sm border border-border bg-background px-2 text-[12px] text-foreground outline-none focus:ring-1 focus:ring-ring disabled:opacity-70";

/**
 * Settings: the complexity tiers — how many business days from the close
 * to Operational Go-Live each tier expects, and when a deal is that tier.
 * Set once at the close on every new project; the TTV report measures the
 * real Go-Live against it.
 */
export function ComplexityTiersPanel({ canManage }: { canManage: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["complexity-tiers"], queryFn: () => getComplexityTiers() });
  const save = useServerFn(setComplexityTiers);
  const [draft, setDraft] = useState<ComplexityTier[] | null>(null);
  const rows = draft ?? q.data ?? [];
  const m = useMutation({
    mutationFn: () => save({ data: { tiers: rows } }),
    onSuccess: async () => {
      setDraft(null);
      await qc.invalidateQueries({ queryKey: ["complexity-tiers"] });
    },
  });
  const edit = (i: number, patch: Partial<ComplexityTier>) =>
    setDraft(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const add = () =>
    setDraft([
      ...rows,
      {
        tier: (rows[rows.length - 1]?.tier ?? -1) + 1,
        name: "",
        business_days: 15,
        qualifies: "",
      },
    ]);
  const remove = (i: number) => setDraft(rows.filter((_, j) => j !== i));
  const valid = rows.length > 0 && rows.every((r) => r.name.trim() && r.business_days >= 0);

  return (
    <section className="overflow-hidden rounded-md border border-border bg-card">
      <header className="border-b border-border px-4 py-2.5">
        <h2 className="text-[13px] font-semibold">Complexity tiers</h2>
        <p className="mt-0.5 text-[11.5px] text-muted-foreground">
          Business days from the close to Operational Go-Live, by how complex the deal is. Set once
          on every new project at the close; Reports measures the real Go-Live against it. The rows
          below are placeholders from the integration tiers until the matrix is pasted in.
        </p>
      </header>
      {q.isPending ? (
        <p className="px-4 py-3 text-[12px] text-muted-foreground">Loading…</p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((r, i) => (
            <li
              key={i}
              className="grid items-center gap-2 px-4 py-2 md:grid-cols-[56px_160px_110px_minmax(0,1fr)_auto]"
            >
              <span className="text-[12px] font-medium tabular-nums">Tier {r.tier}</span>
              <input
                className={inputClass}
                aria-label={`Tier ${r.tier} name`}
                value={r.name}
                placeholder="Name"
                disabled={!canManage || m.isPending}
                onChange={(e) => edit(i, { name: e.target.value })}
              />
              <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <input
                  className={`${inputClass} w-16`}
                  type="number"
                  min={0}
                  max={400}
                  aria-label={`Tier ${r.tier} business days`}
                  value={r.business_days}
                  disabled={!canManage || m.isPending}
                  onChange={(e) => edit(i, { business_days: Number(e.target.value) })}
                />
                bd
              </label>
              <input
                className={inputClass}
                aria-label={`Tier ${r.tier} qualifies when`}
                value={r.qualifies}
                placeholder="Qualifies when…"
                disabled={!canManage || m.isPending}
                onChange={(e) => edit(i, { qualifies: e.target.value })}
              />
              {canManage ? (
                <button
                  type="button"
                  className="text-[11px] text-muted-foreground hover:text-destructive disabled:opacity-40"
                  disabled={m.isPending || rows.length <= 1}
                  onClick={() => remove(i)}
                >
                  Remove
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {canManage ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-2">
          <button
            type="button"
            className="rounded-sm bg-primary px-2.5 py-1 text-[12px] font-medium text-primary-foreground disabled:opacity-50"
            disabled={draft === null || !valid || m.isPending}
            onClick={() => m.mutate()}
          >
            {m.isPending ? "Saving…" : "Save tiers"}
          </button>
          <button
            type="button"
            className="rounded-sm border border-border px-2.5 py-1 text-[12px] disabled:opacity-50"
            disabled={m.isPending || rows.length >= 12}
            onClick={add}
          >
            Add a tier
          </button>
          {m.isError ? (
            <span className="text-[11px] text-destructive">
              {m.error instanceof Error ? m.error.message : "Could not save."}
            </span>
          ) : null}
          <span className="text-[11px] text-muted-foreground">
            A change applies to projects closed from now on; existing tier-expected dates stay.
          </span>
        </div>
      ) : null}
    </section>
  );
}
