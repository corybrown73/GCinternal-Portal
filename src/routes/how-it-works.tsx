import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { PageBody, PageHeader } from "@/components/page";
import { Panel } from "@/components/record";
import { LIFECYCLE_STAGES } from "@/lib/lifecycle";
import { BrandMarkTile } from "@/components/brand-mark";
import { KIND_MARKS, allToolMarks } from "@/lib/brand-marks";

/**
 * The whole flow on one page, by role.
 *
 * WHY. The deal page's guide tells you the next step on that deal. This
 * page tells a new AE, AM or implementation lead what the tool is for and
 * where they enter it, before they have a deal in front of them. It is the
 * text of the walkthrough somebody would otherwise give over Zoom, kept
 * where it is read on the day it is needed.
 */
export const Route = createFileRoute("/how-it-works")({
  head: () => ({ meta: [{ title: "How it works — GoCanvas Handoff Hub" }] }),
  component: HowItWorksPage,
});

type Step = { title: string; body: string; to?: string; label?: string };

const ROLES: Array<{ key: string; who: string; when: string; steps: Step[] }> = [
  {
    key: "ae",
    who: "AE · the deal closes",
    when: "Same day the deal goes closed-won. Three clicks.",
    steps: [
      {
        title: "1. New account",
        body: "On the pipeline: the company, the industry, the call notes pasted in, the signed SOW dropped on. Closed-won deals from Salesforce arrive on their own; add the notes and the SOW to those.",
        to: "/pipeline",
        label: "Pipeline",
      },
      {
        title: "2. Build it",
        body: "One button on the account. It reads the calls and writes the brief, fills the intake, reads the SOW into the plan, builds the plan with dates and makes the customer's link. What the calls did not say comes back as a short list — each one line on the page.",
      },
      {
        title: "3. Open the deck",
        body: "Present it, send the link, or print it. When the deal goes closed-won, the account is created and the implementation team hears there is one to claim.",
      },
    ],
  },
  {
    key: "impl",
    who: "Implementation · the first call",
    when: "Day 1 is the kickoff. Live by day 7 on the new-customer path.",
    steps: [
      {
        title: "Claim the account, then start from the deal",
        body: "A new closed-won account emails everyone in the pool. Open the deal and press Claim this account; it is yours from then on, and the customers list shows every account you own with its day counter.",
        to: "/customers",
        label: "Customers",
      },
      {
        title: "Fill your profile once",
        body: "Photo, title and booking link. The team screen shows your face; the closing screen shows your link. The guide warns you on every deal until it is done.",
        to: "/settings",
        label: "Settings → My profile",
      },
      {
        title: "Check the plan before the call",
        body: "Set the two call times on the plan, and clear the 'before the link goes out' list. The welcome page is what you present; the notes under it are what you say.",
      },
      {
        title: "Present the welcome page, send the link",
        body: "Present mode on the first call. Copy the customer's link from the page; the QR is on the cover. They tick their homework on that same page and you see it land on the deal.",
      },
      {
        title: "Watch the counter, not the calendar",
        body: "The day counter on the deal and on the customer says where the account sits against its plan, today. Past due is amber. Every slip is recorded, by tool and by kind, in delivery analytics.",
        to: "/admin/analytics",
        label: "Delivery analytics",
      },
    ],
  },
  {
    key: "am",
    who: "AM · an existing account buys services",
    when: "When the order form is signed. Two minutes to start.",
    steps: [
      {
        title: "Open the customer, press 'Add services'",
        body: "That starts the existing-account path from their record: the closed-won deal, its implementation on the same customer page, the assignment. It lands you on the Pre-kickoff tab of that implementation.",
        to: "/customers",
        label: "Customers",
      },
      {
        title: "Phase 1 is always the form review",
        body: "On this path the first phase is 'review your form to make sure it is optimised for the integration'. The services you sold follow, one phase each, once the form is ready.",
      },
      {
        title: "Same three clicks",
        body: "Notes in, Build it, Open the deck. The strip at the top of the Deck tab says where the account is on that path.",
      },
    ],
  },
  {
    key: "manager",
    who: "Manager · keeping it running",
    when: "Once, then when someone joins or leaves.",
    steps: [
      {
        title: "The assignment pool",
        body: "Tick the people who take accounts and the rule that shares them out. An empty pool is the one way an account goes nowhere; the guide warns you on every deal until it is filled.",
        to: "/admin/assignment",
        label: "Admin → Assignment",
      },
      {
        title: "Integrations",
        body: "The API key for AI synthesis, the email sender, and the Zapier and Salesforce hooks that create deals. Each one shows whether it is live.",
        to: "/admin/integrations",
        label: "Admin → Integrations",
      },
      {
        title: "Delivery analytics",
        body: "Planned against actual for every closed-won account: which tools run long, which kinds slip, and the step where the days go.",
        to: "/admin/analytics",
        label: "Admin → Delivery analytics",
      },
    ],
  },
];

function HowItWorksPage() {
  return (
    <>
      <PageHeader
        title="How it works"
        description="One record per customer, from the closed-won deal to live in the field. Two paths: a new customer on the 7-day plan, or an existing account adding services. Here is where each role comes in."
      />
      <PageBody className="space-y-4">
        {/* The stage vocabulary used to sit as a bar over every page, highlighting
            nothing. A customer record draws its own stages; the words themselves
            belong here, where somebody looks them up. */}
        <Panel
          title="The standard journey"
          meta={`${LIFECYCLE_STAGES.length} stages · Closed / Won is the trigger, not a stage`}
        >
          <ol className="grid gap-x-6 divide-y divide-border md:grid-cols-2 md:divide-y-0">
            {LIFECYCLE_STAGES.map((stage, i) => (
              <li key={stage.id} className="flex gap-3 px-3 py-2.5">
                <span className="mt-0.5 font-mono text-[10px] font-bold text-muted-foreground">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0">
                  <p className="text-[13px] font-medium">{stage.label}</p>
                  <p className="mt-0.5 text-[12px] text-muted-foreground">{stage.intent}</p>
                </div>
              </li>
            ))}
          </ol>
        </Panel>
        <Panel
          title="The marks"
          meta="What the tiles on a deal, a customer and the welcome page mean"
        >
          <div className="grid gap-x-6 gap-y-2 px-3 py-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {[
              ...Object.entries(KIND_MARKS).map(([key, mark]) => ({ key, mark })),
              ...allToolMarks(),
            ].map(({ key, mark }) => (
              <div key={key} className="flex items-center gap-2.5">
                <BrandMarkTile mark={mark} size="sm" />
                <span className="text-[12.5px]">{mark.title}</span>
              </div>
            ))}
          </div>
        </Panel>
        <div className="grid gap-4 xl:grid-cols-2">
          {ROLES.map((r) => (
            <Panel key={r.key} title={r.who} meta={r.when}>
              <ol className="divide-y divide-border">
                {r.steps.map((s, i) => (
                  <li key={s.title} className="flex gap-3 px-3 py-2.5">
                    <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted font-mono text-[10px] font-bold text-muted-foreground">
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium">{s.title}</p>
                      <p className="mt-0.5 text-[12px] text-muted-foreground">{s.body}</p>
                      {s.to ? (
                        <Link
                          to={s.to}
                          className="mt-1 inline-flex items-center gap-1 text-[12px] font-medium text-primary hover:underline"
                        >
                          {s.label} <ArrowRight className="h-3 w-3" />
                        </Link>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>
            </Panel>
          ))}
        </div>
      </PageBody>
    </>
  );
}
