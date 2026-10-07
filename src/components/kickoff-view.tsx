import { Check, Cloud, FileText } from "lucide-react";

import {
  Frame,
  Icon,
  PhoneMock,
  T,
  Tick,
  Tile,
  type Screen,
  type ScreenArgs,
} from "@/components/welcome-primitives";
import { byLabel } from "@/lib/welcome-journey";
import {
  kickoffBusinessOutcome,
  kickoffFocusContent,
  kickoffWorkflowFallback,
  kickoffWorkflowStory,
} from "@/lib/kickoff-view";
import { shortDay } from "@/lib/onboarding-timeline";
import { cn } from "@/lib/utils";
import type { WelcomeView } from "@/lib/welcome";

/**
 * KICKOFF VIEW — a short TIS-led presentation for the first implementation
 * call, composed from the same WelcomeView the living Plan already reads.
 * One implementation, two views: this file adds the second composition,
 * never a second data model. Internal only — nothing here is reachable
 * from the customer's shared link.
 *
 * Visually, every screen reuses the Plan deck's own grammar — Frame, Tile,
 * Tick, PhoneMock, the journey-flow columns, the milestone rail, the
 * orange "good" CTA — recomposed per screen rather than repeating one card
 * layout seven times. The copy stays the Phase 3 narrative: no fixed call
 * counts, no "Functional", no provenance ever rendered to a customer.
 */

/* ---------------------------------------------------- 1. Welcome / objective */

function KickoffCover({ view }: { view: WelcomeView }) {
  const workflowName = view.firstForm?.name ?? "your workflow";
  const outcome = kickoffBusinessOutcome(view);
  return (
    <section className="wp-screen is-cover">
      <div className="wp-blob is-cover" />
      <div className="wp-dots" />
      <header className="wp-head">
        <img src="/branding/gocanvas-wordmark-navy.png" alt="GoCanvas" className="wp-logo" />
        {view.clientLogoUrl ? (
          <img src={view.clientLogoUrl} alt={view.clientName} className="wp-client-logo" />
        ) : null}
      </header>
      <div className="wp-cover-grid">
        <div className="wp-cover-text">
          <p className="wp-eyebrow">Kickoff · {view.industry ?? "Your team"}</p>
          <h1 className="wp-title is-hero">
            <T k="kickoff-cover.title">Let's bring</T>{" "}
            <span className="wp-accent">
              <T k="kickoff-cover.accent">{workflowName}</T>
            </span>{" "}
            <T k="kickoff-cover.title-end">to life</T>
          </h1>
          <div className="wp-rule" />
          <p className="wp-cover-name">
            <T k="kickoff-cover.name">{view.clientName}</T>
          </p>
          {outcome ? (
            <p className="wp-lede">
              <T k="kickoff-cover.outcome">{outcome}</T>
            </p>
          ) : null}
          {view.timeline.liveDate ? (
            <p className="wp-prepared">
              <T k="kickoff-cover.target">{`Target: ${shortDay(view.timeline.liveDate)}`}</T>
            </p>
          ) : null}
          {view.lead ? (
            <p className="wp-prepared">
              <T k="kickoff-cover.prepared">{`Prepared by ${view.lead}, GoCanvas onboarding`}</T>
            </p>
          ) : null}
        </div>
        <div className="wp-cover-art">
          {view.photoUrl ? (
            <div className="wp-photo">
              <img src={view.photoUrl} alt="" />
              <span className="wp-photo-cap">
                <Icon name={view.icon} className="h-3.5 w-3.5" />
                {view.industry ?? "Your industry"}
              </span>
            </div>
          ) : (
            // The customer's own workflow, on a device, in the same photo
            // slot a customer photo would fill — so the opening moment reads
            // "this is yours" even with no photo on file.
            <div className="wp-photo wp-phone-panel">
              <PhoneMock view={view} />
              <span className="wp-photo-cap">
                <Icon name="Smartphone" className="h-3.5 w-3.5" />
                {workflowName}, on the phone
              </span>
            </div>
          )}
        </div>
      </div>
      <footer className="wp-foot">
        <span>gocanvas.com</span>
        <span>01</span>
      </footer>
      <div className="wp-stripe">
        <i />
        <i />
        <i />
      </div>
    </section>
  );
}

/* ------------------------------------------------- 2. What we understand */

function KickoffUnderstanding({ view, page }: { view: WelcomeView; page: number }) {
  const champion = view.team.champion;
  const others = view.team.others ?? [];
  const outcome = kickoffBusinessOutcome(view);
  const today = view.currentProcess;
  const names = [
    champion ? `${champion.name}${champion.role ? ` · ${champion.role}` : ""}` : null,
    ...others.map((o) => `${o.name}${o.role ? ` · ${o.role}` : ""}`),
  ].filter((x): x is string => Boolean(x));

  const todayColumn = (solo: boolean) => (
    <div className={cn("wp-journey-col is-now", solo && "is-solo")}>
      <span className="wp-journey-tag">Today</span>
      <div className="wp-journey-art">
        <div className="wp-paper">
          <FileText className="h-7 w-7" />
          <i />
          <i />
          <i />
          <i />
        </div>
      </div>
      <h3>How it works today</h3>
      <p className="wp-journey-quote">{today ?? "We'll capture this together on the call."}</p>
    </div>
  );

  return (
    <Frame
      k="kickoff-understand"
      page={page}
      eyebrow="What we understand so far"
      title="You told us,"
      accent="we listened"
      lede="Before we meet — what your calls and your answers have already told us."
      {...(names.length ? { band: `On the call: ${names.join(" · ")}`, bandIcon: "Users" } : {})}
    >
      {outcome ? (
        <div className="wp-journey is-two">
          {todayColumn(false)}
          <span className="wp-journey-arrow" />
          <div className="wp-journey-col is-future">
            <span className="wp-journey-tag is-navy">Where you want to be</span>
            <div className="wp-journey-art">
              <Tile name="Target" size="lg" tone="navy" />
            </div>
            <h3>The outcome</h3>
            <p>{outcome}</p>
          </div>
        </div>
      ) : (
        todayColumn(true)
      )}
    </Frame>
  );
}

/* ------------------------------------------------------- 3. Your workflow */

function KickoffWorkflow({ view, page }: { view: WelcomeView; page: number }) {
  const story =
    kickoffWorkflowStory(view.workflowStory) ??
    kickoffWorkflowFallback({
      currentProcess: view.currentProcess,
      firstFormName: view.firstForm?.name ?? null,
      businessOutcome: kickoffBusinessOutcome(view),
    });
  return (
    <Frame
      k="kickoff-workflow"
      page={page}
      eyebrow="Your workflow"
      title={story ? "Before, during," : "Let's map it"}
      accent={story ? "and after" : "together"}
      lede={
        story
          ? "How the work happens — and what changes."
          : "There's not enough yet to sketch this out — we'll build it on the call."
      }
    >
      {story ? (
        <div className="wp-journey">
          <div className="wp-journey-col is-now">
            <span className="wp-journey-tag">Before</span>
            <div className="wp-journey-art">
              <div className="wp-paper">
                <FileText className="h-7 w-7" />
              </div>
            </div>
            <h3>How it starts</h3>
            <p className="wp-journey-quote">{story.before ?? "To confirm on the call."}</p>
          </div>
          <span className="wp-journey-arrow" />
          <div className="wp-journey-col is-then">
            <span className="wp-journey-tag is-blue">During</span>
            <div className="wp-journey-art">
              <PhoneMock view={view} className="is-flow" />
            </div>
            <h3>While the work happens</h3>
            <p>{story.during ?? "To confirm on the call."}</p>
          </div>
          <span className="wp-journey-arrow" />
          <div className="wp-journey-col is-future">
            <span className="wp-journey-tag is-navy">After</span>
            <div className="wp-journey-art">
              <div className="wp-office">
                <span className="wp-office-tile">
                  <Cloud className="h-6 w-6" />
                </span>
              </div>
            </div>
            <h3>Once it's submitted</h3>
            <p>{story.after ?? "To confirm on the call."}</p>
          </div>
        </div>
      ) : (
        <div className="wp-journey-col is-now is-solo">
          <h3>Let's map it together</h3>
          <p className="wp-journey-quote">
            We'll walk through how the work happens today, step by step, on the call.
          </p>
        </div>
      )}
    </Frame>
  );
}

/* --------------------------------------------------- 4. What we're working on */

function KickoffFocus({ view, page }: { view: WelcomeView; page: number }) {
  const content = kickoffFocusContent(view.implementationFocus, view.implementationFocusFallback);
  // kickoffScreenList never includes this screen when there is nothing to
  // show — see below. This guard is only a second line of defence against
  // ever rendering internal "not prepared yet" housekeeping to a customer.
  if (content.state === "empty") return null;

  const agreed = content.state === "agreed";
  return (
    <Frame
      k="kickoff-focus"
      page={page}
      eyebrow={agreed ? "Agreed implementation focus" : "Proposed implementation focus"}
      title={agreed ? "What we're" : "What we propose"}
      accent="working on"
      lede={
        agreed
          ? "Agreed together — this is where the implementation is focused."
          : "What we believe the implementation should focus on. Let's review it together now."
      }
    >
      <ol className="wp-focus-list">
        {content.items.map((text, i) => (
          <li key={i} className={cn("wp-focus-item", agreed && "is-agreed")}>
            <span className="wp-focus-num">{String(i + 1).padStart(2, "0")}</span>
            <span className="wp-focus-text">{text}</span>
          </li>
        ))}
      </ol>
    </Frame>
  );
}

/* --------------------------------------------------- 5. Two teams, one plan */

function KickoffPartnership({ page }: { page: number }) {
  return (
    <Frame
      k="kickoff-partnership"
      page={page}
      eyebrow="Two teams, one plan"
      title="We come prepared."
      accent="You make it real."
    >
      <div className="wp-partner">
        <div className="wp-partner-col">
          <h3>
            <Tile name="Wrench" size="sm" tone="blue" /> GoCanvas brings
          </h3>
          <ul className="wp-ticks">
            <Tick>Comes prepared, with a plan built from your SOW and your calls</Tick>
            <Tick>Recommends the workflow, and configures or guides it — whichever fits</Tick>
            <Tick>Brings product and process expertise</Tick>
            <Tick>Keeps the implementation moving</Tick>
          </ul>
        </div>
        <div className="wp-partner-divider">
          <Tile name="Handshake" size="lg" tone="navy" />
        </div>
        <div className="wp-partner-col">
          <h3>
            <Tile name="HardHat" size="sm" tone="blue" /> You bring
          </h3>
          <ul className="wp-ticks">
            <Tick>Validates that we've got it right</Tick>
            <Tick>Makes the business decisions</Tick>
            <Tick>Tests it on real work</Tick>
            <Tick>Drives adoption with your team</Tick>
          </ul>
        </div>
      </div>
    </Frame>
  );
}

/* ------------------------------------------------------ 6. Your path to launch */

/** The canonical six stages' icons — decoration only; the labels and order
 * still come from view.journey, never redefined here. */
const STAGE_ICON: Record<string, string> = {
  pre_kickoff: "ClipboardCheck",
  kickoff: "PhoneCall",
  get_it_working: "Wrench",
  make_it_yours: "KeyRound",
  make_it_run: "Workflow",
  complete: "GraduationCap",
};

function KickoffJourney({ view, page }: { view: WelcomeView; page: number }) {
  const j = view.journey;
  return (
    <Frame
      k="kickoff-journey"
      page={page}
      eyebrow="Your path to launch"
      title="Dates create"
      accent="accountability"
      lede="Outcomes move stages. Meetings support the work."
      {...(j ? { band: j.current.blurb, bandIcon: "Route" } : {})}
    >
      {j ? (
        <div className="wp-rail is-six">
          <div className="wp-rail-line" />
          {j.stages.map((s) => (
            <div key={s.key} className={cn("wp-node", s.state === "now" && "is-today")}>
              <span className="wp-node-day">
                {s.state === "now" ? <i className="wp-today-tag">You are here</i> : null}
              </span>
              <span className={cn("wp-node-tile", s.state === "done" && "is-done")}>
                <Tile
                  name={STAGE_ICON[s.key] ?? "Route"}
                  size="lg"
                  tone={s.state === "done" ? "navy" : s.state === "now" ? "blue" : "light"}
                />
                {s.state === "done" ? (
                  <span className="wp-done-badge">
                    <Check className="h-3 w-3" strokeWidth={3} />
                  </span>
                ) : null}
              </span>
              <span className="wp-node-label">{s.label}</span>
              {s.key === "complete" && view.timeline.liveDate ? (
                <span className="wp-node-date">{shortDay(view.timeline.liveDate)}</span>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="wp-journey-col is-now is-solo">
          <h3>Your path to launch</h3>
          <p className="wp-journey-quote">
            Intake &amp; Process → Kickoff → Get it working → Make it yours → Make it run →
            Graduate. Starts once this account is set up.
          </p>
        </div>
      )}
    </Frame>
  );
}

/* ------------------------------------- 7. What ready looks like + next step */

function KickoffNextStep({ view, page }: { view: WelcomeView; page: number }) {
  const next = view.journey?.yours[0] ?? null;
  const nextText = next
    ? `${next.what}${byLabel(next.by) ? ` · ${byLabel(next.by)}` : ""}`
    : view.team.lead
      ? `${view.team.lead} has the ball. You'll hear from us before the next step.`
      : "We have the ball. You'll hear from us before the next step.";
  return (
    <Frame
      k="kickoff-next"
      page={page}
      eyebrow="What ready looks like"
      title="Know what"
      accent="ready looks like"
    >
      <div className="wp-pills">
        <span className="wp-pill">
          <Tile name="Smartphone" size="sm" tone="blue" /> Submits from the phone, on the job
        </span>
        <span className="wp-pill">
          <Tile name="Workflow" size="sm" tone="blue" /> Nothing retyped in the office
        </span>
        <span className="wp-pill">
          <Tile name="Wrench" size="sm" tone="blue" /> A change you ask for lands, and you see it
        </span>
      </div>
      <div className="wp-good-cta is-hero">
        <span className="wp-good-cta-label">Your next step</span>
        <span className="wp-good-cta-text">{nextText}</span>
      </div>
    </Frame>
  );
}

/** The Kickoff composition, in order. Never filtered by the customer's
 * persisted hidden-screen preferences — those belong to the Plan
 * composition only. See WelcomePage's `experience` state.
 *
 * "What we're working on" is left out entirely only when there is neither
 * a saved focus nor a safe structured proposal to derive one from — never
 * to tell a customer that internal prep is unfinished, the same rule the
 * Plan's own optional screens (journey, intake, help) already follow for
 * data that may not exist yet. */
export function kickoffScreenList(view: WelcomeView): Screen[] {
  const hasFocus =
    kickoffFocusContent(view.implementationFocus, view.implementationFocusFallback).state !==
    "empty";
  return [
    {
      key: "kickoff-cover",
      label: "Kickoff · Welcome",
      render: () => <KickoffCover key="kickoff-cover" view={view} />,
    },
    {
      key: "kickoff-understand",
      label: "What we understand so far",
      render: (a) => <KickoffUnderstanding key="kickoff-understand" view={view} page={a.page} />,
    },
    {
      key: "kickoff-workflow",
      label: "Your workflow",
      render: (a) => <KickoffWorkflow key="kickoff-workflow" view={view} page={a.page} />,
    },
    ...(hasFocus
      ? [
          {
            key: "kickoff-focus",
            label: "What we're working on",
            render: (a: ScreenArgs) => (
              <KickoffFocus key="kickoff-focus" view={view} page={a.page} />
            ),
          } satisfies Screen,
        ]
      : []),
    {
      key: "kickoff-partnership",
      label: "Two teams, one plan",
      render: (a) => <KickoffPartnership key="kickoff-partnership" page={a.page} />,
    },
    {
      key: "kickoff-journey",
      label: "Your path to launch",
      render: (a) => <KickoffJourney key="kickoff-journey" view={view} page={a.page} />,
    },
    {
      key: "kickoff-next",
      label: "What ready looks like",
      render: (a) => <KickoffNextStep key="kickoff-next" view={view} page={a.page} />,
    },
  ];
}
