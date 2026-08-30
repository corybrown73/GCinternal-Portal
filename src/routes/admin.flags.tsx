import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, ChevronLeft, Globe } from "lucide-react";

import { PageBody, PageHeader } from "@/components/page";
import { Panel } from "@/components/record";
import { getFlags, setFlag } from "@/lib/flags.functions";
import {
  dependentsOf,
  FLAG_GROUP_LABELS,
  flagsInGroup,
  unmetRequirements,
  type FlagGroup,
  type FlagInfo,
} from "@/lib/feature-flags";
import { cn } from "@/lib/utils";

/**
 * Turning features on and off.
 *
 * Three things this screen is careful to say, because each of them is a support
 * conversation that would otherwise happen:
 *
 *  - a flag is NOT a permission. Who may do a thing is decided by role and
 *    checked on every request. Turning a flag off hides a feature; it revokes
 *    nobody's access.
 *  - flipping one takes up to a minute to reach every server. A flag that looks
 *    unchanged for 30 seconds is otherwise indistinguishable from one that
 *    failed to save.
 *  - some flags need a migration that may not be applied here. Turning one on
 *    early is safe — every gated read falls back — but it will do nothing, and
 *    somebody who does not know that concludes the feature is broken.
 */

const flagsQuery = queryOptions({
  queryKey: ["admin", "flags"],
  queryFn: () => getFlags(),
});

export const Route = createFileRoute("/admin/flags")({
  head: () => ({ meta: [{ title: "Features — Admin | GoCanvas Handoff Hub" }] }),
  loader: ({ context }) => {
    void context.queryClient.ensureQueryData(flagsQuery).catch(() => {});
  },
  errorComponent: ({ error }) => (
    <div role="alert" className="p-6 text-[13px] text-destructive">
      Could not load the feature list: {error.message}
    </div>
  ),
  component: FlagsPage,
});

const GROUP_ORDER: FlagGroup[] = ["customer", "delivery", "presale", "integrations", "platform"];

function FlagsPage() {
  const { data: flags } = useSuspenseQuery(flagsQuery);
  const queryClient = useQueryClient();
  const change = useServerFn(setFlag);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  const state = flags as unknown as Record<string, boolean>;

  const toggle = useMutation({
    mutationFn: (vars: { flag: string; value: boolean }) => change({ data: vars as never }),
    onMutate: (vars) => {
      setPending(vars.flag);
      setError(null);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "flags"] }),
    onError: (e) => setError((e as Error).message),
    onSettled: () => setPending(null),
  });

  const on = GROUP_ORDER.flatMap((g) => flagsInGroup(g)).filter(
    (f) => state[f.key as string] === true,
  ).length;

  return (
    <>
      <PageHeader
        title="Features"
        description="What is switched on for this deployment. A feature is not a permission — who may do something is decided by their role and checked on every request; this decides what exists on the screen."
        actions={
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] text-muted-foreground">{on} on</span>
            <Link
              to="/admin"
              className="inline-flex items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft className="h-3 w-3" /> Admin
            </Link>
          </div>
        }
      />
      <PageBody className="max-w-3xl space-y-3">
        {error ? (
          <p
            role="alert"
            className="rounded-md border border-border bg-status-blocked px-3 py-2 text-[12px] text-status-blocked-foreground"
          >
            {error}
          </p>
        ) : null}

        <p className="rounded-md border border-dashed border-border bg-muted/20 px-3 py-2 text-[12px] text-muted-foreground">
          A change takes up to a minute to reach every server, so a switch you have just flipped may
          keep showing its old behaviour for a moment. Every change is recorded against your name.
        </p>

        {GROUP_ORDER.map((group) => {
          const items = flagsInGroup(group);
          if (items.length === 0) return null;
          return (
            <Panel key={group} title={FLAG_GROUP_LABELS[group]} count={items.length}>
              <ul className="divide-y divide-border">
                {items.map((info) => (
                  <FlagRow
                    key={info.key as string}
                    info={info}
                    state={state}
                    busy={pending === (info.key as string) || toggle.isPending}
                    onToggle={(value) => toggle.mutate({ flag: info.key as string, value })}
                  />
                ))}
              </ul>
            </Panel>
          );
        })}
      </PageBody>
    </>
  );
}

function FlagRow({
  info,
  state,
  busy,
  onToggle,
}: {
  info: FlagInfo;
  state: Record<string, boolean>;
  busy: boolean;
  onToggle: (value: boolean) => void;
}) {
  const isOn = state[info.key as string] === true;
  const unmet = unmetRequirements(info, state);
  const dependents = isOn ? dependentsOf(info.key, state) : [];

  return (
    <li className="flex flex-wrap items-start gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-medium">{info.label}</span>
          {info.external ? (
            // Called out because this is the one category where a careless flip
            // has consequences you cannot take back by flipping it again.
            <span className="inline-flex items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              <Globe className="h-2.5 w-2.5" /> customers see this
            </span>
          ) : null}
          <span className="font-mono text-[10px] text-muted-foreground">{info.key as string}</span>
        </p>
        <p className="mt-0.5 text-[12px] text-muted-foreground">{info.description}</p>

        {unmet.length > 0 ? (
          <p className="mt-1 flex items-start gap-1 text-[11px] text-muted-foreground">
            <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
            Does nothing until {unmet.join(" and ")} {unmet.length === 1 ? "is" : "are"} on too.
          </p>
        ) : null}

        {dependents.length > 0 ? (
          <p className="mt-1 flex items-start gap-1 text-[11px] text-muted-foreground">
            <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
            Turning this off also stops {dependents.map((d) => `“${d.label}”`).join(" and ")}.
          </p>
        ) : null}

        {info.needsMigration ? (
          <p className="mt-1 font-mono text-[10px] text-muted-foreground">
            needs migration {info.needsMigration}
          </p>
        ) : null}
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={isOn}
        aria-label={`${info.label}: ${isOn ? "on" : "off"}`}
        disabled={busy}
        onClick={() => onToggle(!isOn)}
        className={cn(
          "mt-0.5 flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors disabled:opacity-40",
          isOn
            ? "justify-end border-foreground bg-foreground"
            : "justify-start border-border bg-muted",
        )}
      >
        <span
          className={cn(
            "mx-0.5 h-4 w-4 rounded-full",
            isOn ? "bg-background" : "bg-muted-foreground/60",
          )}
        />
      </button>
    </li>
  );
}
