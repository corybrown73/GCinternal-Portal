import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { PageBody, PageHeader } from "@/components/page";
import { Panel } from "@/components/record";

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
    when: "Same day the deal goes closed-won. Ten minutes.",
    steps: [
      {
        title: "Open the deal from the pipeline",
        body: "Closed-won deals arrive from Zapier and Salesforce on their own. If yours is missing, add it on the pipeline board.",
        to: "/pipeline",
        label: "Pipeline",
      },
      {
        title: "Pick the path, first",
        body: "New customer, or an existing account adding services. It is the first question in the intake, and every screen after it follows the answer.",
      },
      {
        title: "Paste the Gong brief, then generate the customer brief",
        body: "Call notes or the account map into Notes & documents. The 'Generate customer brief' button at the top right lights up once a note and the path are in; it reads the calls and fills the intake's blanks: the process today, the forms, seats, systems. Check what it filled.",
      },
      {
        title: "Upload the signed SOW and read it into the plan",
        body: "The PDF is the record. 'Read the SOW into the plan' proposes the services on it; tick what is right, and the plan's phases fill in from the close date.",
      },
      {
        title: "Hand it over",
        body: "When the deal closes, the implementation team is told there is an account to claim, and whoever takes it becomes the owner (a manager can also assign by hand, or switch to assignment by rule under Admin → Assignment). Your part is done when the guide strip reads 7/7.",
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
        body: "That starts the existing-account path from their record: the closed-won deal, the link back to the customer, the assignment. It lands you on the deal.",
        to: "/customers",
        label: "Customers",
      },
      {
        title: "Phase 1 is always the form review",
        body: "On this path the first phase is 'review your form to make sure it is optimised for the integration'. The services you sold follow, one phase each, once the form is ready.",
      },
      {
        title: "Same guide, same seven steps",
        body: "Gong brief, synthesise, SOW, times, share. The guide strip on the deal points at the next one until the page is ready to send.",
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
