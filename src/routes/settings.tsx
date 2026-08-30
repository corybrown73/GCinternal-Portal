import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { PageBody, PageHeader, EmptyState } from "@/components/page";
import { AppearanceSettings } from "@/components/appearance-settings";
import { canManage, useProfile } from "@/lib/auth";
import { LIFECYCLE_BOUNDARY_LABEL, LIFECYCLE_STAGE_MAP } from "@/lib/lifecycle";
import { getLifecycleStages } from "@/lib/lifecycle-stages.functions";
import { getPipelineStages } from "@/lib/pipeline-stages.functions";
import { STAGE_COLOR_CLASS } from "@/lib/pipeline-stages";
import { cn } from "@/lib/utils";

/**
 * The two halves of the journey, on one page, both editable.
 *
 * This page used to describe the pre-sale steps under a heading that said
 * "Upstream — not owned by this app", with a note that the pre-handoff
 * operating model was not yet agreed. That was true once. It stopped being true
 * when the pre-sale pipeline became a configured, editable thing this
 * application owns — and a settings page that disowns half the product it is
 * describing teaches everyone the wrong model of what the tool is for.
 *
 * Both lists read their live configuration, so what is on this page is what an
 * admin last saved, not what was compiled in months ago.
 */

const lifecycleQuery = queryOptions({
  queryKey: ["lifecycle-stages"],
  queryFn: () => getLifecycleStages(),
});

const pipelineQuery = queryOptions({
  queryKey: ["pipeline-stages"],
  queryFn: () => getPipelineStages(),
});

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Implementation Hub" },
      {
        name: "description",
        content:
          "The stages an implementation moves through, what has to be true to leave each one, and team defaults.",
      },
      { property: "og:title", content: "Settings — Implementation Hub" },
      {
        property: "og:description",
        content: "Stages, what has to be true to leave each one, and team settings.",
      },
    ],
  }),
  loader: ({ context }) => {
    void context.queryClient.ensureQueryData(lifecycleQuery).catch(() => {});
    void context.queryClient.ensureQueryData(pipelineQuery).catch(() => {});
  },
  component: SettingsPage,
});

function SettingsPage() {
  const { profile } = useProfile();
  const { data: lifecycle } = useSuspenseQuery(lifecycleQuery);
  const { data: pipeline } = useSuspenseQuery(pipelineQuery);
  const manage = canManage(profile?.role);
  return (
    <>
      <PageHeader
        title="Settings"
        description="One record per customer, from the first pre-sale conversation through to handover to Customer Success — including every project they run along the way. Roles shown are descriptive context only; they drive no assignment or permissions."
      />
      <PageBody className="space-y-5">
        <AppearanceSettings canManage={canManage(profile?.role)} />

        <section className="overflow-hidden rounded-md border border-border bg-card">
          <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-4 py-2.5">
            <div>
              <h2 className="text-[13px] font-semibold">Pre-sales</h2>
              <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                From first conversation to Closed Won. These stages are yours to name and reorder.
              </p>
            </div>
            {manage ? (
              <Link
                to="/admin/pipeline-stages"
                className="rounded-sm border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
              >
                Edit
              </Link>
            ) : null}
          </header>
          <ul className="divide-y divide-border">
            {pipeline.map((stage, i) => (
              <li key={stage.key} className="flex items-center gap-3 px-4 py-2">
                <span className="w-6 shrink-0 font-mono text-[11px] text-muted-foreground">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="w-32 shrink-0 text-[13px] font-medium">{stage.label}</span>
                <span
                  className={cn(
                    "rounded-sm px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider",
                    STAGE_COLOR_CLASS[stage.color],
                  )}
                >
                  {stage.is_won ? "closed won" : stage.is_terminal ? "final" : "\u00a0"}
                </span>
                <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                  {stage.key}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="overflow-hidden rounded-md border border-border bg-card">
          <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-4 py-2.5">
            <div>
              <h2 className="text-[13px] font-semibold">Post-sale</h2>
              <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                From handoff to Customer Success. Roles are descriptive context and drive nothing.
              </p>
            </div>
            {manage ? (
              <Link
                to="/admin/lifecycle-stages"
                className="rounded-sm border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
              >
                Edit
              </Link>
            ) : null}
          </header>
          <ul className="divide-y divide-border">
            {lifecycle.map((stage, i) => {
              // Role and boundary context comes from the structural definition,
              // which is keyed by id — so a renamed stage keeps its roles.
              // A stage somebody added has none, and shows none.
              const structure = LIFECYCLE_STAGE_MAP[stage.key as keyof typeof LIFECYCLE_STAGE_MAP];
              return (
                <li key={stage.key} className="flex gap-3 px-4 py-2.5">
                  <span className="w-6 shrink-0 pt-px font-mono text-[11px] text-muted-foreground">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="w-32 shrink-0 text-[13px] font-medium">{stage.label}</span>
                  <div className="min-w-0 space-y-1">
                    {stage.intent ? (
                      <p className="text-[13px] text-muted-foreground">{stage.intent}</p>
                    ) : null}
                    {structure ? (
                      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10.5px] uppercase tracking-wide text-muted-foreground/80">
                        <span>Leads: {structure.leads.join(" + ")}</span>
                        {structure.supports ? (
                          <span>Supports: {structure.supports.join(" + ")}</span>
                        ) : null}
                        {structure.boundary ? (
                          <span className="rounded-sm border border-border px-1.5 py-px normal-case tracking-normal text-foreground">
                            {LIFECYCLE_BOUNDARY_LABEL[structure.boundary]}
                          </span>
                        ) : null}
                        {structure.overlay ? (
                          <span className="normal-case tracking-normal">
                            {structure.overlay.role} overlay: {structure.overlay.condition}
                          </span>
                        ) : null}
                      </p>
                    ) : (
                      <p className="font-mono text-[10.5px] uppercase tracking-wide text-muted-foreground/80">
                        Added here \u00b7 takes part in no built-in rule
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <EmptyState
          title="Team & roles"
          description="Sign-in roles and permissions are managed under Admin → Users. Roles listed above are descriptive lifecycle context only."
          hint="See Admin → Users"
        />
      </PageBody>
    </>
  );
}
