import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, X } from "lucide-react";

import {
  addParkingItemFn,
  getParkingLot,
  removeParkingItemFn,
  updateParkingItemFn,
} from "@/lib/parking-lot.functions";
import { cn } from "@/lib/utils";

type Item = Awaited<ReturnType<typeof getParkingLot>>[number];

const STATUS: Record<Item["status"], string> = {
  open: "Open",
  scheduled: "Scheduled",
  done: "Done",
  dropped: "Dropped",
};
const OWNER: Record<Item["owner"], string> = {
  gocanvas: "GoCanvas",
  customer: "Customer",
  both: "Both",
};

/**
 * The parking lot: what came up that is not today's objective. Captured in
 * one line on the call, reviewed at the close of every meeting, shown to the
 * customer on their page. "We are not saying no. We are deciding when."
 */
export function ParkingLot({ dealId, editable }: { dealId: string; editable: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["parking-lot", dealId],
    queryFn: () => getParkingLot({ data: { dealId } }),
  });
  const add = useServerFn(addParkingItemFn);
  const update = useServerFn(updateParkingItemFn);
  const remove = useServerFn(removeParkingItemFn);
  const [request, setRequest] = useState("");
  const [why, setWhy] = useState("");
  const [launch, setLaunch] = useState(false);
  const [owner, setOwner] = useState<Item["owner"]>("gocanvas");
  const [target, setTarget] = useState("");
  const [error, setError] = useState<string | null>(null);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["parking-lot", dealId] });
    void qc.invalidateQueries({ queryKey: ["welcome", dealId] });
  };
  const addM = useMutation({
    mutationFn: () =>
      add({
        data: {
          dealId,
          item: {
            request: request.trim(),
            why: why.trim(),
            needed_for_launch: launch,
            owner,
            target,
          },
        },
      }),
    onMutate: () => setError(null),
    onSuccess: () => {
      setRequest("");
      setWhy("");
      setLaunch(false);
      setTarget("");
      refresh();
    },
    onError: (e) => setError((e as Error).message),
  });
  const upd = useMutation({
    mutationFn: (v: { id: string; patch: Record<string, unknown> }) =>
      update({ data: { id: v.id, patch: v.patch as never } }),
    onSuccess: refresh,
    onError: (e) => setError((e as Error).message),
  });
  const del = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: refresh,
    onError: (e) => setError((e as Error).message),
  });
  const items = q.data ?? [];
  const open = items.filter((i) => i.status === "open" || i.status === "scheduled");
  const cell = "h-7 rounded-sm border border-border bg-background px-1.5 text-[12px]";

  return (
    <details className="border-t border-border" open={open.length > 0}>
      <summary className="cursor-pointer px-4 py-2 text-[12px] font-medium">
        Parking lot{" "}
        <span className="font-normal text-muted-foreground">
          · {open.length} open
          {items.length > open.length ? ` · ${items.length - open.length} closed` : ""} · review it
          at the end of every meeting — “we are not saying no, we are deciding when”
        </span>
      </summary>
      <div className="space-y-2 px-4 pb-3">
        {items.length ? (
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="py-1 pr-2 font-medium">Request</th>
                <th className="py-1 pr-2 font-medium">Launch?</th>
                <th className="py-1 pr-2 font-medium">Owner</th>
                <th className="py-1 pr-2 font-medium">When</th>
                <th className="py-1 pr-2 font-medium">Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr
                  key={i.id}
                  className={cn(
                    "border-t border-border align-top",
                    (i.status === "done" || i.status === "dropped") && "text-muted-foreground",
                  )}
                >
                  <td className="py-1.5 pr-2">
                    <span className={cn(i.status === "done" && "line-through")}>{i.request}</span>
                    {i.why ? (
                      <span className="block text-[11px] text-muted-foreground">{i.why}</span>
                    ) : null}
                  </td>
                  <td className="py-1.5 pr-2">{i.needed_for_launch ? "Yes" : "No"}</td>
                  <td className="py-1.5 pr-2">{OWNER[i.owner]}</td>
                  <td className="py-1.5 pr-2">{i.target || "—"}</td>
                  <td className="py-1.5 pr-2">
                    <select
                      className={cell}
                      value={i.status}
                      disabled={!editable || upd.isPending}
                      onChange={(e) => upd.mutate({ id: i.id, patch: { status: e.target.value } })}
                      aria-label={`Status of ${i.request}`}
                    >
                      {Object.entries(STATUS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-1.5 text-right">
                    {editable ? (
                      <button
                        type="button"
                        className="rounded-sm p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                        title="Remove it"
                        onClick={() => del.mutate(i.id)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-[12px] text-muted-foreground">
            Nothing parked yet. When something comes up that is not today's objective, park it here
            in one line.
          </p>
        )}
        {editable ? (
          <form
            className="flex flex-wrap items-center gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              if (request.trim()) addM.mutate();
            }}
          >
            <input
              className={cn(cell, "w-60")}
              placeholder="What came up"
              value={request}
              maxLength={300}
              onChange={(e) => setRequest(e.target.value)}
            />
            <input
              className={cn(cell, "w-48")}
              placeholder="Why it matters (optional)"
              value={why}
              maxLength={500}
              onChange={(e) => setWhy(e.target.value)}
            />
            <label className="inline-flex items-center gap-1 text-[12px]">
              <input
                type="checkbox"
                checked={launch}
                onChange={(e) => setLaunch(e.target.checked)}
              />
              Needed for launch
            </label>
            <select
              className={cell}
              value={owner}
              onChange={(e) => setOwner(e.target.value as Item["owner"])}
              aria-label="Owner"
            >
              {Object.entries(OWNER).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <input
              className={cn(cell, "w-32")}
              placeholder="When: Stage 3, Oct 20"
              value={target}
              maxLength={80}
              onChange={(e) => setTarget(e.target.value)}
            />
            <button
              type="submit"
              className="inline-flex h-7 items-center gap-1 rounded-sm bg-primary px-2.5 text-[12px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              disabled={!request.trim() || addM.isPending}
            >
              <Plus className="h-3.5 w-3.5" />
              Park it
            </button>
          </form>
        ) : null}
        {error ? <p className="text-[12px] text-destructive">{error}</p> : null}
      </div>
    </details>
  );
}
