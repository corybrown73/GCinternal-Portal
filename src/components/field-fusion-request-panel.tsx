import { Link } from "@tanstack/react-router";

import { Panel } from "@/components/record";
import { readIntake, type FieldFusionRequest } from "@/lib/intake-answers";
import type { DealData } from "@/lib/deal-query";

/**
 * The "New FF Client Request" form, as it was filled in GoCanvas.
 *
 * Read only, and word for word: it is what Liesl already typed about the
 * client, kept on the deal so that at the close nobody types it again. The
 * Field Fusion setup notes were written from it once; a person's edit there
 * stands. Shown only on a deal that arrived through the form.
 */
export function FieldFusionRequestPanel({ deal }: { deal: DealData }) {
  const intake = readIntake(deal.account.intake);
  const r = intake.field_fusion.request;
  if (!r) return null;

  const admin = [r.admin_first_name, r.admin_last_name].filter(Boolean).join(" ") || null;
  const meta = [
    r.submission_no ? `No. ${r.submission_no}` : null,
    r.submitted_at,
    r.requester_name ? `by ${r.requester_name}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Panel
      id="panel-ff-request"
      title="Field Fusion request"
      meta={meta || "From the GoCanvas form"}
      level="primary"
      collapsible
      defaultOpen
      collapseKey="deal:ff-request"
    >
      <div className="space-y-4 p-3 text-[12px]">
        <p className="text-muted-foreground">
          The New FF Client Request form, as it was filled in GoCanvas. The Field Fusion setup notes
          started from these answers; edit them there, not here.
        </p>

        <Section title="Company & admin">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 md:grid-cols-3">
            <Item label="Company" value={r.company_name} />
            <Item label="Main admin" value={admin} />
            <Item label="GCID" value={r.admin_gcid} />
            <Item
              label="Email"
              value={
                r.admin_email ? (
                  <a className="underline" href={`mailto:${r.admin_email}`}>
                    {r.admin_email}
                  </a>
                ) : null
              }
            />
            <Item label="Phone" value={r.admin_phone} />
            <Item label="Industry" value={r.industry} />
            <Item
              label="Salesforce"
              value={
                r.salesforce_url ? (
                  <a className="underline" href={r.salesforce_url} target="_blank" rel="noreferrer">
                    Open the opportunity
                  </a>
                ) : null
              }
            />
            <Item
              label="Logo"
              value={
                r.logo_url ? (
                  <a className="underline" href={r.logo_url} target="_blank" rel="noreferrer">
                    View
                  </a>
                ) : null
              }
            />
          </dl>
        </Section>

        <Section title="Relevant features">
          <Chips items={r.features} empty="None ticked" />
          {r.analytics_needs ? <Prose label="Analytics needs" text={r.analytics_needs} /> : null}
          {r.output_destinations.length ? (
            <div className="mt-2">
              <Label>Output destinations</Label>
              <Chips items={r.output_destinations} empty="" />
            </div>
          ) : null}
        </Section>

        <Section title="Primary use case">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 md:grid-cols-3">
            <Item label="First use case" value={r.first_use_case} />
            <Item label="Forms in progress" value={r.forms_in_progress} />
            <Item label="PDF" value={r.pdf_designer} />
          </dl>
          {r.process_description ? (
            <Prose label="Description of the process" text={r.process_description} />
          ) : null}
        </Section>

        <Section title="Relevant data sets">
          <Chips items={r.data_sets} empty="None ticked" />
        </Section>

        <Section title="Customer context">
          <div className="space-y-2">
            <div>
              <Label>Customers are</Label>
              <Chips items={r.customers_are} empty="Not answered" />
            </div>
            <div>
              <Label>Customers have</Label>
              <Chips items={r.customers_have} empty="Not answered" />
            </div>
            <div>
              <Label>Customer sites are</Label>
              <Chips items={r.sites_are} empty="Not answered" />
            </div>
          </div>
        </Section>

        {r.notes ? (
          <Section title="Notes & other use cases">
            <p className="whitespace-pre-wrap text-[13px] leading-relaxed">{r.notes}</p>
          </Section>
        ) : null}

        <p className="text-[11px] text-muted-foreground">
          Requested by {r.requester_name ?? "—"}
          {r.requester_email ? ` (${r.requester_email})` : ""}.{" "}
          <Link to="/admin/integrations" className="underline">
            How the form reaches this page
          </Link>
        </p>
      </div>
    </Panel>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        {title}
      </h4>
      {children}
    </section>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1 text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
      {children}
    </p>
  );
}

function Item({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 break-words text-[13px]">{value ?? "—"}</dd>
    </div>
  );
}

function Chips({ items, empty }: { items: string[]; empty: string }) {
  if (!items.length) return empty ? <p className="text-muted-foreground">{empty}</p> : null;
  return (
    <ul className="flex flex-wrap gap-1">
      {items.map((it) => (
        <li key={it} className="rounded-sm border border-border bg-muted/30 px-1.5 py-0.5">
          {it}
        </li>
      ))}
    </ul>
  );
}

function Prose({ label, text }: { label: string; text: string }) {
  return (
    <div className="mt-2">
      <Label>{label}</Label>
      <p className="whitespace-pre-wrap text-[13px] leading-relaxed">{text}</p>
    </div>
  );
}

/** What the request holds, for the summary line on other pages. */
export function requestSummary(r: FieldFusionRequest): string | null {
  return r.first_use_case ?? r.industry ?? null;
}
