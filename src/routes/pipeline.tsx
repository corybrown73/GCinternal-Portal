import { createFileRoute } from "@tanstack/react-router";
import { dealValue } from "@/lib/deal-value";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { PageBody, PageHeader } from "@/components/page";
import { DealBoard } from "@/components/presale/deal-board";
import { CsvImportDialog, NewDealDialog } from "@/components/presale/deal-dialogs";
import { canEditDeal, canManage, useProfile } from "@/lib/auth";
import { useScope } from "@/lib/use-scope";
import { getPipeline, moveDealStage } from "@/lib/presale.functions";
import { parseWonGate } from "@/lib/won-gate";
import { ClosedWonGateNotice } from "@/components/closed-won-gate";
import type { AccountStage } from "@/lib/presale-stages";
import { fmtMoney } from "@/lib/hub-format";

const pipelineQuery = (scope: string | null) =>
  queryOptions({
    queryKey: ["pipeline", scope],
    queryFn: () => getPipeline({ data: scope ? { scope } : {} }),
  });

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
  validateSearch: (search: Record<string, unknown>): { scope?: string } =>
    typeof search["scope"] === "string" ? { scope: search["scope"] as string } : {},
  loaderDeps: ({ search }: { search: { scope?: string } }) => ({ scope: search.scope ?? null }),
  loader: ({ context, deps }) => {
    // Prefetch is best-effort: on the SSR pass there is no bearer token, so the
    // auth-gated serverFn fails there and the client fetch takes over.
    void context.queryClient.ensureQueryData(pipelineQuery(deps.scope)).catch(() => {});
  },
  errorComponent: ({ error }) => (
    <div role="alert" className="p-6 text-[13px] text-destructive">
      Could not load the pipeline: {error.message}
    </div>
  ),
  component: PipelinePage,
});

function PipelinePage() {
  const { param, setScope } = useScope();
  const { data } = useSuspenseQuery(pipelineQuery(param));
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
  });
  // A refused Closed Won move: the board shows what is missing, with the way
  // to add it, instead of a browser dialog.
  const gate = moveMutation.isError ? parseWonGate((moveMutation.error as Error).message) : null;

  const arrTotal = data.deals.reduce((sum, d) => sum + (dealValue(d) ?? 0), 0);
  const pocCount = data.deals.filter((d) => d.ff_poc).length;

  return (
    <>
      <PageHeader
        title="Pipeline"
        description="Presale deals by stage. Drag a card to record a stage transition; every move is written to the stage history."
        actions={
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] text-muted-foreground">
              {data.deals.length} {data.deals.length === 1 ? "deal" : "deals"} ·{" "}
              {fmtMoney(arrTotal)}
              {pocCount ? ` · ${pocCount} Field Fusion POC${pocCount === 1 ? "" : "s"}` : ""}
            </span>
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
        {gate && moveMutation.variables ? (
          <div className="mt-2">
            <ClosedWonGateNotice
              missing={gate}
              dealId={moveMutation.variables.dealId}
              toStage={moveMutation.variables.toStage}
              canForce={canManage(profile?.role)}
              onForce={() => moveMutation.mutate({ ...moveMutation.variables!, force: true })}
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
