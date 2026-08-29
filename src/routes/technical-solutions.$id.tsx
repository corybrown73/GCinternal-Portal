import type { ReactNode } from "react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { ChevronRight, ArrowRight } from "lucide-react";

import { PageBody } from "@/components/page";
import {
  AttentionBand,
  Field,
  NoRows,
  Panel,
  PrimarySignal,
  StageBadge,
  StatusChip,
} from "@/components/record";
import { getTechnicalSolution } from "@/lib/hub.functions";
import type { TechnicalSolutionDetail } from "@/lib/hub-types";
import { fmtDate, fmtDateTime, humanize } from "@/lib/hub-format";
import { technicalSolutionNextAction, waitingOnForSolution } from "@/lib/customer360-derive";
import {
  AddNoteAction,
  DesignEditor,
  OwnerEditor,
  StatusEditor,
} from "@/components/solution-write";
import { AddFieldMapping, FieldMappingRow } from "@/components/field-mapping-write";
import { OpenAttachment } from "@/components/sow-write";
import { splitLinks } from "@/lib/journal-input";

const solutionQuery = (id: string) =>
  queryOptions({
    queryKey: ["technical-solution", id],
    queryFn: () => getTechnicalSolution({ data: { id } }),
  });

export const Route = createFileRoute("/technical-solutions/$id")({
  head: () => ({
    meta: [
      { title: "Technical Solution — Implementation Hub" },
      {
        name: "description",
        content:
          "Technical solution record: design, configuration, field mapping, journal, ownership history and traceability.",
      },
      { property: "og:title", content: "Technical Solution — Implementation Hub" },
      {
        property: "og:description",
        content: "Current state and history for one technical solution record.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: async ({ context, params }) => {
    const record = await context.queryClient.ensureQueryData(solutionQuery(params.id));
    if (!record) throw notFound();
  },
  errorComponent: ({ error }) => (
    <div role="alert" className="p-6 text-[13px] text-destructive">
      Could not load this technical solution: {error.message}
    </div>
  ),
  notFoundComponent: () => (
    <div className="p-6 text-[13px]">
      That technical solution does not exist.{" "}
      <Link
        to="/technical-solutions"
        search={{ sort: "customer", dir: "asc" }}
        className="underline"
      >
        Back to the queue
      </Link>
    </div>
  ),
  component: SolutionDetail,
});

const dash = (v: ReactNode) => (v === null || v === undefined || v === "" ? "—" : v);

const NOTE_TYPE_CLASS: Record<string, string> = {
  assessment: "bg-muted text-foreground",
  design: "bg-muted text-foreground",
  build: "bg-muted text-foreground",
  limitation: "bg-status-risk text-status-risk-foreground",
  handoff: "bg-status-ontrack text-status-ontrack-foreground",
};

function SolutionDetail() {
  const { id } = Route.useParams();
  const { data } = useSuspenseQuery(solutionQuery(id));
  const record = data as TechnicalSolutionDetail;
  const { solution, customer, implementation, requirement } = record;
  const next = technicalSolutionNextAction(record);
  const waiting = waitingOnForSolution(record);

  return (
    <>
      <header className="border-b border-border bg-surface px-5 py-3">
        <nav className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <Link
            to="/technical-solutions"
            search={{ sort: "customer", dir: "asc" }}
            className="hover:text-foreground"
          >
            Technical Solutions
          </Link>
          <ChevronRight className="h-3 w-3" />
          {customer.id ? (
            <Link
              to="/customers/$customerId"
              params={{ customerId: customer.id }}
              search={implementation ? { impl: implementation.id } : {}}
              className="hover:text-foreground"
            >
              {customer.name}
            </Link>
          ) : (
            <span>{customer.name}</span>
          )}
          <ChevronRight className="h-3 w-3" />
          {customer.id ? (
            <Link
              to="/customers/$customerId"
              params={{ customerId: customer.id }}
              search={{
                tab: "solution",
                ...(implementation ? { impl: implementation.id } : {}),
              }}
              className="hover:text-foreground"
            >
              {implementation?.name ?? "Implementation"}
            </Link>
          ) : (
            <span>{implementation?.name ?? "Implementation"}</span>
          )}
          <ChevronRight className="h-3 w-3" />
          <span className="text-foreground">{solution.title}</span>
        </nav>

        <div className="mt-2 flex flex-wrap items-baseline gap-3">
          <h1 className="text-[18px] font-semibold tracking-tight">{solution.title}</h1>
          <StatusChip status={solution.status} />
          <StatusEditor solutionId={solution.id} status={solution.status} />
          {implementation ? <StageBadge stage={implementation.current_stage} /> : null}
        </div>

        <div className="mt-3">
          <AttentionBand>
            {waiting ? (
              <PrimarySignal
                label="Waiting on"
                emphasis="medium"
                value="Technical Solutions"
                detail={waiting.reason.replace(/^Waiting on Technical Solutions — /, "")}
              />
            ) : null}
            <PrimarySignal label="Next action" value={next} />
          </AttentionBand>
        </div>

        <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field
            label="Owner"
            value={
              <OwnerEditor
                solutionId={solution.id}
                ownerId={solution.owner_id}
                ownerName={solution.owner_name}
                team={record.team}
              />
            }
          />
          <Field
            label="Requirement solved"
            value={
              requirement ? (
                customer.id ? (
                  <Link
                    to="/customers/$customerId"
                    params={{ customerId: customer.id }}
                    search={{
                      tab: "requirements",
                      ...(implementation ? { impl: implementation.id } : {}),
                    }}
                    className="hover:underline"
                  >
                    {requirement.title}
                  </Link>
                ) : (
                  requirement.title
                )
              ) : (
                "No requirement linked"
              )
            }
          />
          <Field label="Created" value={fmtDate(solution.created_at)} />
          <Field label="Last updated" value={fmtDate(solution.updated_at)} />
        </dl>
      </header>

      <PageBody className="space-y-5">
        <section className="space-y-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Current state
          </h2>

          <Panel
            title="Design record"
            meta={
              <span className="flex items-center gap-2">
                <span>{humanize(solution.status)}</span>
                <DesignEditor
                  solutionId={solution.id}
                  designSummary={solution.design_summary}
                  configurationDetails={solution.configuration_details}
                />
              </span>
            }
          >
            <div className="grid gap-3 px-3 py-2.5 md:grid-cols-2">
              <div>
                <div className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                  Design summary
                </div>
                <p className="whitespace-pre-wrap text-[12px] leading-relaxed">
                  {dash(solution.design_summary)}
                </p>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                  Configuration details
                </div>
                <p className="whitespace-pre-wrap text-[12px] leading-relaxed">
                  {dash(solution.configuration_details)}
                </p>
              </div>
            </div>
          </Panel>

          <Panel
            title="Field mapping"
            count={record.field_mappings.length}
            meta={<AddFieldMapping solutionId={solution.id} />}
          >
            {record.field_mappings.length ? (
              <table className="w-full text-left">
                <thead className="border-b border-border bg-surface text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                  <tr>
                    <th className="px-3 py-1.5 font-medium">Source field</th>
                    <th className="px-3 py-1.5 font-medium">Source system</th>
                    <th className="px-3 py-1.5 font-medium">GoCanvas field</th>
                    <th className="px-3 py-1.5 font-medium">Transformation</th>
                    <th className="px-3 py-1.5 font-medium">Required</th>
                    <th className="px-3 py-1.5 font-medium">Status</th>
                    <th className="px-3 py-1.5 text-right font-medium">Maintain</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {record.field_mappings.map((m: any) => (
                    <FieldMappingRow key={m.id} solutionId={solution.id} mapping={m} />
                  ))}
                </tbody>
              </table>
            ) : (
              <NoRows label="No field mappings recorded. Add the first one to connect source data to the right fields." />
            )}
          </Panel>
        </section>

        <section className="space-y-3 border-t border-border pt-4">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            History &amp; context
          </h2>

          <Panel
            level="reference"
            title="Technical Solutions journal"
            count={record.notes.length}
            meta={
              <span className="flex items-center gap-2">
                <span>Newest first</span>
                <AddNoteAction solutionId={solution.id} team={record.team} />
              </span>
            }
          >
            {record.notes.length ? (
              <ul className="divide-y divide-border">
                {record.notes.map((n) => (
                  <li key={n.id} className="px-3 py-2">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span
                        className={`inline-flex items-center rounded-sm px-1.5 py-0.5 text-[11px] font-medium ${
                          NOTE_TYPE_CLASS[n.note_type] ?? "bg-muted text-muted-foreground"
                        }`}
                      >
                        {humanize(n.note_type)}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {n.author_name ?? "Author not recorded"} · {fmtDateTime(n.created_at)}
                      </span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-[12px] leading-relaxed">
                      {n.content}
                    </p>
                    {splitLinks(n.links).length ? (
                      <ul className="mt-1 space-y-0.5">
                        {splitLinks(n.links).map((link) => (
                          <li key={link}>
                            <a
                              href={link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[11px] text-primary underline"
                            >
                              {link}
                            </a>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {n.attachment_url ? (
                      <div className="mt-1 flex items-center gap-2 text-[11px]">
                        <span>{n.attachment_name ?? "Attachment"}</span>
                        <OpenAttachment path={n.attachment_url} label="Open" />
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <NoRows label="No journal entries recorded yet." />
            )}
          </Panel>

          <Panel
            level="reference"
            title="Ownership changes"
            count={record.ownership_history.length}
          >
            {record.ownership_history.length ? (
              <ul className="divide-y divide-border">
                {record.ownership_history.map((h) => (
                  <li key={h.id} className="px-3 py-2 text-[12px]">
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {fmtDateTime(h.changed_at)}
                    </span>{" "}
                    · {dash(h.old_value)} → {dash(h.new_value)}
                    {h.changed_by_name ? ` · by ${h.changed_by_name}` : ""}
                    {h.change_reason ? ` · ${h.change_reason}` : ""}
                  </li>
                ))}
              </ul>
            ) : (
              <NoRows label="No ownership changes recorded." />
            )}
          </Panel>

          <Panel level="reference" title="Decisions" count={record.decisions.length}>
            {record.decisions.length ? (
              <ul className="divide-y divide-border">
                {record.decisions.map((d: any) => (
                  <li key={d.id} className="px-3 py-2">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="text-[13px] font-medium">{d.title}</span>
                      <StatusChip status={d.status} />
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {fmtDate(d.decision_date)}
                      </span>
                      {d.decided_by ? (
                        <span className="text-[11px] text-muted-foreground">
                          decided by {d.decided_by}
                        </span>
                      ) : null}
                    </div>
                    {d.rationale ? (
                      <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                        {d.rationale}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <NoRows label="No decisions linked to this solution." />
            )}
          </Panel>

          <Panel level="reference" title="Proof" count={record.evidence.length}>
            {record.evidence.length ? (
              <ul className="divide-y divide-border">
                {record.evidence.map((e: any) => (
                  <li key={e.id} className="px-3 py-2 text-[12px]">
                    <span className="font-medium">{e.title}</span>{" "}
                    <span className="text-muted-foreground">
                      · {humanize(e.type)} · {e.uploaded_by_name ?? "Unknown"} ·{" "}
                      {fmtDate(e.created_at)}
                    </span>
                    {e.description ? (
                      <p className="mt-0.5 text-muted-foreground">{e.description}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <NoRows label="No proof attached to this solution." />
            )}
          </Panel>

          <Panel level="reference" title="Approvals" count={record.approvals.length}>
            {record.approvals.length ? (
              <ul className="divide-y divide-border">
                {record.approvals.map((a: any) => (
                  <li key={a.id} className="px-3 py-2 text-[12px]">
                    <span className="font-medium">{a.title}</span> <StatusChip status={a.status} />
                    <span className="text-muted-foreground">
                      {" "}
                      · {a.approver_name ?? "Unnamed approver"}
                      {a.approver_role ? ` (${a.approver_role})` : ""} · requested{" "}
                      {fmtDate(a.requested_at)}
                      {a.decided_at ? ` · decided ${fmtDate(a.decided_at)}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <NoRows label="No approvals recorded against this solution." />
            )}
          </Panel>

          <Panel
            level="reference"
            title="Traceability"
            count={record.trace.length + record.linked_trace.length}
            meta="Direct links, plus links via a decision"
          >
            {record.trace.length || record.linked_trace.length ? (
              <div className="space-y-2.5 px-3 py-2.5">
                {record.trace.length ? (
                  <div className="space-y-1.5">
                    <div className="text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
                      Direct links
                    </div>
                    {record.trace.map((s) => (
                      <div
                        key={`${s.entity_type}-${s.id}`}
                        className="flex items-center gap-1.5 text-[12px]"
                      >
                        <span className="text-muted-foreground">{humanize(s.entity_type)}</span>
                        <ArrowRight className="h-3 w-3 text-muted-foreground" />
                        <span>{s.label}</span>
                        <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                          {s.relationship}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}

                {record.linked_trace.length ? (
                  <div className="space-y-1.5 border-l-2 border-dashed border-border pl-2.5">
                    <div className="text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
                      Linked via a decision (indirect)
                    </div>
                    {record.linked_trace.map((s) => (
                      <div
                        key={`indirect-${s.entity_type}-${s.id}`}
                        className="flex items-center gap-1.5 text-[12px] text-muted-foreground"
                      >
                        <span>{humanize(s.entity_type)}</span>
                        <ArrowRight className="h-3 w-3" />
                        <span className="text-foreground">{s.label}</span>
                        <span className="font-mono text-[10px] uppercase tracking-wide">
                          {s.relationship}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}

                {record.trace.some((s) => s.entity_type.startsWith("requirement")) ? null : record
                    .linked_trace.length &&
                  record.linked_trace.some((s) => s.entity_type.startsWith("requirement")) ? (
                  <p className="pt-1 text-[11px] text-muted-foreground">
                    No direct link from the requirement to this solution — it is connected via a
                    linked decision instead.
                  </p>
                ) : (
                  <p className="pt-1 text-[11px] text-muted-foreground">
                    No requirement link found in the trace history — the requirement shown in the
                    header comes from this solution's requirement field.
                  </p>
                )}
              </div>
            ) : (
              <NoRows label="No trace links exist for this solution." />
            )}
          </Panel>
        </section>
      </PageBody>
    </>
  );
}
