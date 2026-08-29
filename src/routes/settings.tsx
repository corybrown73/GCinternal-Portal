import { createFileRoute } from "@tanstack/react-router";
import { PageBody, PageHeader, EmptyState } from "@/components/page";
import {
  LIFECYCLE_BOUNDARY_LABEL,
  LIFECYCLE_STAGES,
  PRE_HANDOFF_CONTEXT,
} from "@/lib/lifecycle";


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
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <>
      <PageHeader
        title="Settings"
        description="This app owns the implementation journey only: it begins once the opportunity is Closed/Won and the work is handed over. Roles shown are descriptive context only — they drive no assignment or permissions."
      />
      <PageBody className="space-y-5">
        <section className="overflow-hidden rounded-md border border-border bg-card">
          <header className="border-b border-border px-4 py-2.5">
            <h2 className="text-[13px] font-semibold">Implementation lifecycle</h2>
            <p className="mt-0.5 text-[11.5px] text-muted-foreground">
              Eight owned stages, starting at Handoff.
            </p>
          </header>
          <ul className="divide-y divide-border">

            {LIFECYCLE_STAGES.map((stage, i) => (
              <li key={stage.id} className="flex gap-3 px-4 py-2.5">
                <span className="w-6 shrink-0 pt-px font-mono text-[11px] text-muted-foreground">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="w-28 shrink-0 text-[13px] font-medium">{stage.label}</span>
                <div className="min-w-0 space-y-1">
                  <p className="text-[13px] text-muted-foreground">{stage.intent}</p>
                  <p className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10.5px] uppercase tracking-wide text-muted-foreground/80">
                    <span>Leads: {stage.leads.join(" + ")}</span>
                    {stage.supports ? <span>Supports: {stage.supports.join(" + ")}</span> : null}
                    {stage.boundary ? (
                      <span className="rounded-sm border border-border px-1.5 py-px normal-case tracking-normal text-foreground">
                        {LIFECYCLE_BOUNDARY_LABEL[stage.boundary]}
                      </span>
                    ) : null}
                  </p>
                  {stage.overlay ? (
                    <p className="text-[11.5px] text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {stage.overlay.role} overlay (conditional):
                      </span>{" "}
                      {stage.overlay.condition}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="overflow-hidden rounded-md border border-dashed border-border bg-muted/20">
          <header className="border-b border-border px-4 py-2.5">
            <h2 className="text-[13px] font-semibold">Upstream — not owned by this app</h2>
            <p className="mt-0.5 text-[11.5px] text-muted-foreground">
              Context from the broader company journey. No stages, ownership or workflow are modelled
              here; the pre-handoff operating model is not yet agreed.
            </p>
          </header>
          <ul className="divide-y divide-border">
            {PRE_HANDOFF_CONTEXT.map((step) => (
              <li key={step.label} className="flex gap-3 px-4 py-2">
                <span className="w-28 shrink-0 text-[13px] font-medium text-muted-foreground">
                  {step.label}
                </span>
                <p className="text-[12px] text-muted-foreground">{step.note}</p>
              </li>
            ))}
          </ul>
        </section>



        <EmptyState
          title="Team & roles"
          description="Owners, workload limits and permissions will be set up here."
          hint="Not available yet"
        />
      </PageBody>
    </>
  );
}
