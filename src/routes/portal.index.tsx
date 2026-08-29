import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { CalendarDays, LifeBuoy, Sparkles } from "lucide-react";

import { portalHomeQuery } from "@/components/portal/portal-queries";
import { ProgressBar, StageTracker } from "@/components/portal/stage-tracker";
import { fmtDate, fmtDateTime, stageLabel } from "@/lib/hub-format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/portal/")({
  loader: ({ context }) => {
    context.queryClient.ensureQueryData(portalHomeQuery);
  },
  errorComponent: ({ error }) => (
    <div role="alert" className="rounded-md border border-border bg-card p-6 text-[13px]">
      <p className="font-medium">We couldn&apos;t load your onboarding view.</p>
      <p className="mt-1 text-muted-foreground">{error.message}</p>
    </div>
  ),
  component: PortalHomePage,
});

function PortalHomePage() {
  const { data } = useSuspenseQuery(portalHomeQuery);

  return (
    <div className="space-y-6">
      {/* Hero: one card per implementation with a big stage tracker. */}
      {data.implementations.length === 0 ? (
        <div className="rounded-md border border-border bg-card px-6 py-10 text-center">
          <p className="text-[14px] font-medium">Your onboarding hasn&apos;t started yet</p>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Once your implementation kicks off, you&apos;ll see live progress here.
          </p>
        </div>
      ) : (
        data.implementations.map((impl) => (
          <section key={impl.id} className="rounded-md border border-border bg-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  Your implementation
                </p>
                <h1 className="mt-0.5 text-[17px] font-semibold tracking-tight">{impl.name}</h1>
                <p className="mt-0.5 text-[12px] text-muted-foreground">
                  Currently in{" "}
                  <span className="font-medium text-foreground">
                    {stageLabel(impl.current_stage)}
                  </span>
                </p>
              </div>
              <div className="text-right">
                <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  <CalendarDays className="mr-1 inline h-3 w-3 align-[-2px]" />
                  Target launch
                </p>
                <p className="mt-0.5 font-mono text-[13px] font-medium">
                  {fmtDate(impl.target_launch_date)}
                </p>
              </div>
            </div>

            <div className="mt-5">
              <StageTracker currentStage={impl.current_stage} />
            </div>

            <div className="mt-4">
              <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Overall progress
              </p>
              <ProgressBar pct={impl.progress_pct} />
            </div>
          </section>
        ))
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {/* Your next steps */}
        <section className="rounded-md border border-border bg-card">
          <header className="border-b border-border px-4 py-2.5">
            <h2 className="text-[13px] font-semibold">Your next steps</h2>
            <p className="text-[11px] text-muted-foreground">
              What&apos;s coming up — items past their date are flagged.
            </p>
          </header>
          <ul className="divide-y divide-border">
            {data.next_steps.length === 0 ? (
              <li className="px-4 py-6 text-center text-[12px] text-muted-foreground">
                Nothing outstanding right now.
              </li>
            ) : (
              data.next_steps.map((step) => (
                <li
                  key={`${step.kind}-${step.id}`}
                  className={cn("px-4 py-2.5", step.overdue && "bg-status-risk")}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p
                        className={cn(
                          "text-[13px]",
                          step.overdue && "text-status-risk-foreground font-medium",
                        )}
                      >
                        {step.title}
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {step.kind === "commitment" ? "Commitment" : "Milestone"}
                        {step.who ? ` · with ${step.who}` : ""} · {step.implementation_name}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 font-mono text-[11px]",
                        step.overdue ? "text-status-risk-foreground" : "text-muted-foreground",
                      )}
                    >
                      {step.overdue ? "overdue · " : ""}
                      {fmtDate(step.due_date)}
                    </span>
                  </div>
                </li>
              ))
            )}
          </ul>
        </section>

        {/* Recent activity */}
        <section className="rounded-md border border-border bg-card">
          <header className="border-b border-border px-4 py-2.5">
            <h2 className="text-[13px] font-semibold">Recent activity</h2>
            <p className="text-[11px] text-muted-foreground">
              Stage changes and completed milestones.
            </p>
          </header>
          <ul className="divide-y divide-border">
            {data.activity.length === 0 ? (
              <li className="px-4 py-6 text-center text-[12px] text-muted-foreground">
                No activity recorded yet.
              </li>
            ) : (
              data.activity.map((item) => (
                <li key={item.id} className="flex items-start gap-2.5 px-4 py-2.5">
                  <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-status-ontrack-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px]">{item.label}</p>
                    {item.detail ? (
                      <p className="text-[11px] text-muted-foreground">{item.detail}</p>
                    ) : null}
                  </div>
                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                    {fmtDateTime(item.at)}
                  </span>
                </li>
              ))
            )}
          </ul>
        </section>
      </div>

      {/* Help card */}
      <Link
        to="/portal/tickets"
        className="block rounded-md border border-border bg-surface p-5 transition-colors hover:border-primary/50"
      >
        <div className="flex items-center gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <LifeBuoy className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h2 className="text-[14px] font-semibold">Ask a question / Get help</h2>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              Send a question to your GoCanvas team — you&apos;ll get a response within 24 hours.
            </p>
          </div>
          <span className="text-[12px] font-medium text-primary">Open →</span>
        </div>
      </Link>
    </div>
  );
}
