import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { dealValue } from "@/lib/deal-value";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { PageBody, PageHeader } from "@/components/page";
import { DealBoard } from "@/components/presale/deal-board";
import { CsvImportDialog, NewDealDialog } from "@/components/presale/deal-dialogs";
import { canEditDeal, canManage, useProfile } from "@/lib/auth";
import { useScope } from "@/lib/use-scope";
import { getPipeline, moveDealStage } from "@/lib/presale.functions";
import { parseWonGate, type WonGateMissing } from "@/lib/won-gate";
import { ClosedWonGateNotice } from "@/components/closed-won-gate";
import type { AccountStage } from "@/lib/presale-stages";
import { fmtMoney } from "@/lib/hub-format";
import { errorMessage } from "@/lib/error-message";
import { readShowTests } from "@/lib/test-accounts";
import { ShowTestsToggle } from "@/components/show-tests-toggle";

// The test-account view is its own cache entry; the default key is unchanged.
const pipelineQuery = (scope: string | null, tests = false) =>
  queryOptions({
    queryKey: tests ? ["pipeline", scope, "tests"] : ["pipeline", scope],
    queryFn: () =>
      getPipeline({
        data: { ...(scope ? { scope } : {}), ...(tests ? { includeTests: true } : {}) },
      }),
  });

type PipelineSearch = { scope?: string; tests?: boolean };

export const Route = createFileRoute("/pipeline")({
  head: () => ({
    meta: [
      { title: "Pipeline — GoCanvas Handoff Hub" },
      {
        name: "description",
        content:
          "Presale deals across this deployment's configured pipeline stages. Drag a deal to record a stage transition.",
      },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): PipelineSearch => ({
    ...(typeof search["scope"] === "string" ? { scope: search["scope"] as string } : {}),
    // "Show test accounts" (0085): off unless the link says so.
    ...(readShowTests(search["tests"]) ? { tests: true } : {}),
  }),
  loaderDeps: ({ search }: { search: PipelineSearch }) => ({
    scope: search.scope ?? null,
    tests: search.tests === true,
  }),
  loader: ({ context, deps }) => {
    // Prefetch is best-effort: on the SSR pass there is no bearer token, so the
    // auth-gated serverFn fails there and the client fetch takes over.
    void context.queryClient.ensureQueryData(pipelineQuery(deps.scope, deps.tests)).catch(() => {});
  },
  errorComponent: ({ error }) => (
    <div role="alert" className="p-6 text-[13px] text-destructive">
      Could not load the pipeline: {errorMessage(error)}
    </div>
  ),
  component: PipelinePage,
});

function PipelinePage() {
  const { param, setScope } = useScope();
  const { tests } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { data } = useSuspenseQuery(pipelineQuery(param, tests === true));
  const { profile } = useProfile();
  const queryClient = useQueryClient();
  const move = useServerFn(moveDealStage);
  const editable = canEditDeal(profile?.role);

  const moveMutation = useMutation({
    mutationFn: (vars: { dealId: string; toStage: AccountStage; note?: string; force?: boolean }) =>
      move({
        data: {
          dealId: vars.dealId,
          toStage: vars.toStage,
          ...(vars.note ? { note: vars.note } : {}),
          ...(vars.force ? { force: true } : {}),
        },
      }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["pipeline"] }),
    // A refused move: the board shows what is missing, with the way to add
    // it. The notice stays through the forced retry, so "Moving…" shows.
    onError: (e, vars) => {
      const missing = parseWonGate((e as Error).message);
      setGate(missing ? { missing, dealId: vars.dealId, toStage: vars.toStage } : null);
    },
    onSuccess: () => setGate(null),
  });
  const [gate, setGate] = useState<{
    missing: WonGateMissing[];
    dealId: string;
    toStage: AccountStage;
  } | null>(null);

  // The count and the money are the real book: a test account shown on the
  // board is never in them.
  const real = data.deals.filter((d) => !d.is_test);
  const testCount = data.deals.length - real.length;
  const arrTotal = real.reduce((sum, d) => sum + (dealValue(d) ?? 0), 0);
  const pocCount = real.filter((d) => d.ff_poc).length;

  return (
    <>
      <PageHeader
        title="Pipeline"
        description="Presale deals by stage. Drag a card to record a stage transition; every move is written to the stage history."
        actions={
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] text-muted-foreground">
              {real.length} {real.length === 1 ? "deal" : "deals"} · {fmtMoney(arrTotal)}
              {pocCount ? ` · ${pocCount} Field Fusion POC${pocCount === 1 ? "" : "s"}` : ""}
              {testCount ? ` · +${testCount} test` : ""}
            </span>
            <ShowTestsToggle
              checked={tests === true}
              onChange={(on) =>
                navigate({
                  search: (prev: PipelineSearch) => {
                    const { tests: _drop, ...rest } = prev;
                    return on ? { ...rest, tests: true } : rest;
                  },
                })
              }
            />
            {editable ? (
              <>
                <CsvImportDialog />
                <NewDealDialog />
              </>
            ) : null}
          </div>
        }
      />
      <PageBody>
        <DealBoard
          deals={data.deals}
          stages={data.stages}
          canDrag={editable}
          onMove={(dealId, toStage, note) =>
            moveMutation.mutateAsync({ dealId, toStage, ...(note ? { note } : {}) })
          }
        />
        {gate ? (
          <div className="mt-2">
            <ClosedWonGateNotice
              missing={gate.missing}
              dealId={gate.dealId}
              toStage={gate.toStage}
              canForce={canManage(profile?.role)}
              onForce={() =>
                moveMutation.mutate({ dealId: gate.dealId, toStage: gate.toStage, force: true })
              }
              forcing={moveMutation.isPending}
            />
          </div>
        ) : moveMutation.isError ? (
          <p role="alert" className="mt-2 text-[12px] text-destructive">
            The stage change was not saved: {(moveMutation.error as Error).message}
          </p>
        ) : null}
      </PageBody>
    </>
  );
}
