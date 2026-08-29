import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { PageBody, PageHeader } from "@/components/page";
import { DealBoard } from "@/components/presale/deal-board";
import { CsvImportDialog, NewDealDialog } from "@/components/presale/deal-dialogs";
import { canEditSales, useProfile } from "@/lib/auth";
import { getPipeline, moveDealStage } from "@/lib/presale.functions";
import type { AccountStage } from "@/lib/presale-stages";

const pipelineQuery = queryOptions({
  queryKey: ["pipeline"],
  queryFn: () => getPipeline(),
});

export const Route = createFileRoute("/pipeline")({
  head: () => ({
    meta: [
      { title: "Pipeline — GoCanvas Handoff Hub" },
      {
        name: "description",
        content:
          "Presale deals across the five stages from Prospect to Onboarding Complete. Drag a deal to record a stage transition.",
      },
    ],
  }),
  loader: ({ context }) => {
    // Prefetch is best-effort: on the SSR pass there is no bearer token, so the
    // auth-gated serverFn fails there and the client fetch takes over.
    void context.queryClient.ensureQueryData(pipelineQuery).catch(() => {});
  },
  errorComponent: ({ error }) => (
    <div role="alert" className="p-6 text-[13px] text-destructive">
      Could not load the pipeline: {error.message}
    </div>
  ),
  component: PipelinePage,
});

function PipelinePage() {
  const { data } = useSuspenseQuery(pipelineQuery);
  const { profile } = useProfile();
  const queryClient = useQueryClient();
  const move = useServerFn(moveDealStage);
  const editable = canEditSales(profile?.role);

  const moveMutation = useMutation({
    mutationFn: (vars: { dealId: string; toStage: AccountStage }) => move({ data: vars }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["pipeline"] }),
  });

  const arrTotal = data.deals.reduce((sum, d) => sum + (d.arr ?? 0), 0);

  return (
    <>
      <PageHeader
        title="Pipeline"
        description="Presale deals by stage. Drag a card to record a stage transition; every move is written to the stage history."
        actions={
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] text-muted-foreground">
              {data.deals.length} deals · ${arrTotal.toLocaleString()}
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
          canDrag={editable}
          onMove={(dealId, toStage) => moveMutation.mutateAsync({ dealId, toStage })}
        />
        {moveMutation.isError ? (
          <p role="alert" className="mt-2 text-[12px] text-destructive">
            The stage change was not saved: {(moveMutation.error as Error).message}
          </p>
        ) : null}
      </PageBody>
    </>
  );
}
