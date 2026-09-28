import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { saveIntake } from "./presale.functions";

/**
 * A checkbox that changes the moment it is clicked.
 *
 * Every tick on a deal used to wait for its save and then for the record to
 * be read back, so a box clicked twice quickly lost a click and a slow
 * network made the page feel broken. This keeps the answer locally, sends
 * the saves one after another (each carries one key, and the server
 * merges), and reads the record back once the last save is in. A failed
 * save puts the boxes back and says why.
 *
 * `section` names the intake block the keys live in; `encode` turns the
 * on/off into what that block stores (a timestamp for handoff tasks, a
 * boolean for the Field Fusion checks).
 */
export function useOptimisticTick(args: {
  dealId: string;
  section: "handoff_tasks" | "field_fusion";
  encode?: (on: boolean) => unknown;
}) {
  const qc = useQueryClient();
  const save = useServerFn(saveIntake);
  const [optimistic, setOptimistic] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(0);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const pending = useRef(0);
  const encode = args.encode ?? ((on: boolean) => (on ? new Date().toISOString() : null));

  const mutate = (v: { key: string; on: boolean }) => {
    setError(null);
    setOptimistic((o) => ({ ...o, [v.key]: v.on }));
    pending.current += 1;
    setBusy((n) => n + 1);
    const settle = () => {
      pending.current -= 1;
      setBusy((n) => Math.max(0, n - 1));
    };
    queue.current = queue.current
      .then(() =>
        save({
          data: {
            dealId: args.dealId,
            patch: { [args.section]: { [v.key]: encode(v.on) } },
          },
        } as never),
      )
      .then(
        async () => {
          settle();
          if (pending.current > 0) return;
          await qc.invalidateQueries({ queryKey: ["deal", args.dealId] });
          setOptimistic({});
        },
        async (e: unknown) => {
          settle();
          setError(e instanceof Error ? e.message : "The tick did not save.");
          setOptimistic({});
          await qc.invalidateQueries({ queryKey: ["deal", args.dealId] });
        },
      );
  };

  /** The state to show: what was just clicked, else what the record says. */
  const isOn = (key: string, saved: boolean) => optimistic[key] ?? saved;

  return { mutate, isOn, isPending: busy > 0, error };
}
