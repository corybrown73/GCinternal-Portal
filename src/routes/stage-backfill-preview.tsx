import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { PageBody, PageHeader } from "@/components/page";
import { NoRows, Panel, TableScroll } from "@/components/record";
import { getStageBackfillPreview } from "@/lib/stage-backfill-preview.functions";
import type { BackfillCandidate } from "@/lib/server/stage-backfill-preview";
import { humanize } from "@/lib/hub-format";
import { errorMessage } from "@/lib/error-message";
import { cn } from "@/lib/utils";

/**
 * Read-only view of getStageBackfillPreview() (#38): which legacy
 * implementations have no — or only some — journey stage_instances, and
 * what a backfill would propose for each, from the same evidence the
 * server function itself reads. No route here calls anything but that one
 * GET: no insert, update, delete, or rpc is wired to this page.
 *
 * No extra role gate: the root AuthGate already keeps every non-public
 * route internal-only, the exact bar requireInternalAuth holds the server
 * function to, so this page needs nothing stricter than being here.
 */
export const Route = createFileRoute("/stage-backfill-preview")({
  head: () => ({
    meta: [
      { title: "Stage-instance backfill preview — GoCanvas Handoff Hub" },
      {
        name: "description",
        content:
          "Read-only: which legacy implementations are missing journey stage_instances, and what a backfill would propose for each.",
      },
    ],
  }),
  component: StageBackfillPreviewPage,
});

const STATUS_CLASS: Record<BackfillCandidate["status"], string> = {
  clean: "bg-status-ontrack text-status-ontrack-foreground",
  partial: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  needs_review: "bg-status-blocked text-status-blocked-foreground",
};

function StatusPill({ status }: { status: BackfillCandidate["status"] }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm px-1.5 py-0.5 text-[11px] font-medium",
        STATUS_CLASS[status],
      )}
    >
      {humanize(status)}
    </span>
  );
}

function StageBackfillPreviewPage() {
  const query = useQuery({
    queryKey: ["stage-backfill-preview"],
    queryFn: () => getStageBackfillPreview(),
  });
  const data = query.data;

  return (
    <>
      <PageHeader
        title="Stage-instance backfill preview"
        description="Which legacy implementations have no, or only some, journey stage_instances, and what a backfill would propose for each — read-only. Nothing on this page writes to the database."
      />
      <PageBody className="max-w-5xl space-y-4">
        <Panel
          title="Candidates"
          {...(data ? { count: data.length } : {})}
          meta="getStageBackfillPreview() — read-only"
        >
          {query.isPending ? (
            <NoRows label="Loading…" />
          ) : query.isError ? (
            <p className="px-3 py-4 text-[12px] text-destructive">
              Could not load the preview: {errorMessage(query.error)}
            </p>
          ) : !data || data.length === 0 ? (
            <NoRows label="No legacy implementations need a stage_instances backfill right now." />
          ) : (
            <TableScroll minWidth={760}>
              <table className="w-full text-left">
                <thead className="border-b border-border bg-surface text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                  <tr>
                    <th className="px-3 py-1.5 font-medium">Implementation</th>
                    <th className="px-3 py-1.5 font-medium">Current stage</th>
                    <th className="px-3 py-1.5 font-medium">Proposed template</th>
                    <th className="px-3 py-1.5 font-medium">Status</th>
                    <th className="px-3 py-1.5 font-medium">Review reasons</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.map((c) => (
                    <tr key={c.implementationId} className="align-top hover:bg-muted/60">
                      <td className="px-3 py-1.5 text-[13px] font-medium">
                        {c.implementationName}
                      </td>
                      <td className="px-3 py-1.5 font-mono text-[12px] text-muted-foreground">
                        {c.currentStage}
                      </td>
                      <td className="px-3 py-1.5 text-[12px]">
                        {c.templateMatch
                          ? `${c.templateMatch.templateKey} v${c.templateMatch.templateVersion}`
                          : "—"}
                      </td>
                      <td className="px-3 py-1.5">
                        <StatusPill status={c.status} />
                      </td>
                      <td className="px-3 py-1.5 text-[12px] text-muted-foreground">
                        {c.reviewReasons.length === 0 ? (
                          "—"
                        ) : (
                          <ul className="list-disc space-y-0.5 pl-4">
                            {c.reviewReasons.map((r, i) => (
                              <li key={i}>{r}</li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
          )}
        </Panel>
      </PageBody>
    </>
  );
}
