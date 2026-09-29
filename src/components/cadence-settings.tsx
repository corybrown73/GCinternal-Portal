import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { getKickoffCadence, setKickoffCadence } from "@/lib/kickoff-cadence.functions";

const inputClass =
  "h-7 w-full rounded-sm border border-border bg-background px-2 text-[12px] text-foreground outline-none focus:ring-1 focus:ring-ring";

/** Settings: the Salesloft cadence a new account goes into while the first meeting is booked. */
export function CadenceSettings({ canManage }: { canManage: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["kickoff-cadence"], queryFn: () => getKickoffCadence() });
  const save = useServerFn(setKickoffCadence);
  const [name, setName] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: () =>
      save({ data: { name: name ?? q.data?.name ?? "", url: url ?? q.data?.url ?? "" } }),
    onSuccess: async () => {
      setName(null);
      setUrl(null);
      await qc.invalidateQueries({ queryKey: ["kickoff-cadence"] });
    },
  });
  const dirty = name !== null || url !== null;
  return (
    <section className="overflow-hidden rounded-md border border-border bg-card">
      <header className="border-b border-border px-4 py-2.5">
        <h2 className="text-[13px] font-semibold">Kickoff cadence</h2>
        <p className="mt-0.5 text-[11.5px] text-muted-foreground">
          The Salesloft cadence a new account is added to while the first meeting is being booked.
          The checklist names it, so nobody has to know the process to follow it.
        </p>
      </header>
      <div className="grid gap-3 px-4 py-3 md:grid-cols-2">
        <label className="block space-y-0.5">
          <span className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
            Cadence name
          </span>
          <input
            className={inputClass}
            value={name ?? q.data?.name ?? ""}
            placeholder="e.g. Onboarding — kickoff booking"
            disabled={!canManage || m.isPending}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="block space-y-0.5">
          <span className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
            Link (optional)
          </span>
          <input
            className={inputClass}
            value={url ?? q.data?.url ?? ""}
            placeholder="https://app.salesloft.com/…"
            disabled={!canManage || m.isPending}
            onChange={(e) => setUrl(e.target.value)}
          />
        </label>
      </div>
      {canManage ? (
        <div className="flex items-center gap-2 border-t border-border px-4 py-2">
          <button
            type="button"
            className="rounded-sm bg-primary px-2.5 py-1 text-[12px] font-medium text-primary-foreground disabled:opacity-50"
            disabled={!dirty || m.isPending}
            onClick={() => m.mutate()}
          >
            {m.isPending ? "Saving…" : "Save"}
          </button>
          {m.isError ? (
            <span className="text-[11px] text-destructive">
              {m.error instanceof Error ? m.error.message : "Could not save."}
            </span>
          ) : null}
          {!q.data?.name && !dirty ? (
            <span className="text-[11px] text-amber-800 dark:text-amber-300">
              Not named yet — the checklist says “the Salesloft cadence” and nothing more.
            </span>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
