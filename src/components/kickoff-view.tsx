import { Check, Cloud, FileText } from "lucide-react";

import {
  Frame,
  Icon,
  PhoneMock,
  T,
  Tick,
  Tile,
  type Screen,
} from "@/components/welcome-primitives";
import { byLabel } from "@/lib/welcome-journey";
import {
  kickoffBusinessOutcome,
  kickoffFocusContent,
  kickoffWorkflowStory,
} from "@/lib/kickoff-view";
import { shortDay } from "@/lib/onboarding-timeline";
import { cn } from "@/lib/utils";
import type { WelcomeView } from "@/lib/welcome";

/**
 * KICKOFF VIEW — a short TIS-led presentation for the first implementation
 * call, composed from the same WelcomeView the living Plan already reads.
 * One implementation, two views: this file adds the second composition,
 * never a second data model. Internal only in this PR — nothing here is
 * reachable from the customer's shared link.
 *
 * Narrative: here is what we already understand, here is what we believe
 * we are solving, here is what we propose working on, and here is the
 * plan. Did we get it right? No fixed call counts, no "Functional" — this
 * is a first conversation, not a discovery session from zero.
 *
 * The pure decisions behind the trickier screens (what Focus may say,
 * whether the workflow story is worth showing) live in lib/kickoff-view.ts
 * so they can be tested without rendering anything.
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
            <div className="wp-art">
              <div className="wp-art-ring" />
              <div className="wp-art-disc">
                <Icon name={view.icon} className="wp-art-icon" strokeWidth={1.5} />
              </div>
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
  return (
    <Frame
      k="kickoff-understand"
      page={page}
      eyebrow="What we understand so far"
      title="Here's what we've"
      accent="heard"
      lede="Before we meet: what your calls and your answers have already told us."
      {...(outcome ? { band: outcome, bandIcon: "Target" } : {})}
    >
      <div className="wp-two">
        <div className="wp-card">
          <div className="wp-card-head">
            <Tile name="Workflow" tone="blue" />
            <h3>How it works today</h3>
          </div>
          <p className="wp-card-body">
            {view.currentProcess ?? "We'll capture this together on the call."}
          </p>
        </div>
        <div className="wp-card is-tint">
          <div className="wp-card-head">
            <Tile name="Users" tone="blue" />
            <h3>Who's involved</h3>
          </div>
          {champion || others.length ? (
            <ul className="wp-ticks">
              {champion ? (
                <Tick>
                  {champion.name}
                  {champion.role ? ` · ${champion.role}` : ""}
                </Tick>
              ) : null}
              {others.map((o) => (
                <Tick key={o.name}>
                  {o.name}
                  {o.role ? ` · ${o.role}` : ""}
                </Tick>
              ))}
            </ul>
          ) : (
            <p className="wp-card-body">We'll confirm who's involved on the call.</p>
          )}
        </div>
      </div>
    </Frame>
  );
}

/* ------------------------------------------------------- 3. Your workflow */

function KickoffWorkflow({ view, page }: { view: WelcomeView; page: number }) {
  const story = kickoffWorkflowStory(view.workflowStory);
  return (
    <Frame
      k="kickoff-workflow"
      page={page}
      eyebrow="Your workflow"
      title="Before, during,"
      accent="and after"
      lede={
        story
          ? "How the work happens — and what changes."
          : "How the work happens today. The detail firms up together on the call."
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
        <div className="wp-card">
          <div className="wp-card-head">
            <Tile name="Workflow" tone="blue" />
            <h3>How it works today</h3>
          </div>
          <p className="wp-card-body">
            {view.currentProcess ?? "We'll capture this together on the call."}
          </p>
        </div>
      )}
    </Frame>
  );
}

/* --------------------------------------------------- 4. What we're working on */

function KickoffFocus({ view, page }: { view: WelcomeView; page: number }) {
  const content = kickoffFocusContent(view.implementationFocus);

  if (content.state === "empty") {
    return (
      <Frame
        k="kickoff-focus"
        page={page}
        eyebrow="What we're working on"
        title="Implementation focus"
        accent="not prepared yet"
      >
        <div className="wp-card">
          <p className="wp-card-body">
            Implementation Focus hasn't been generated yet. Prepare it on Current Implementation
            before presenting this screen.
          </p>
        </div>
      </Frame>
    );
  }

  const agreed = content.state === "agreed";
  return (
    <Frame
      k="kickoff-focus"
      page={page}
      eyebrow={agreed ? "What we're working on" : "Proposed implementation focus"}
      title={agreed ? "What we're" : "What we believe"}
      accent={agreed ? "working on" : "we're solving"}
      lede={
        agreed
          ? "Agreed together — this is where the implementation is focused."
          : "This is what we believe the implementation should focus on. Let's review it together now."
      }
    >
      <ul className="wp-ticks">
        {content.items.map((text, i) => (
          <Tick key={i}>{text}</Tick>
        ))}
      </ul>
    </Frame>
  );
}

/* --------------------------------------------------- 5. Two teams, one plan */

function KickoffPartnership({ page }: { page: number }) {
  return (
    <Frame
      k="kickoff-partnership"
      page={page}
      eyebrow="Two teams"
      title="Two teams,"
      accent="one plan"
      lede="We come prepared. You make it real."
    >
      <div className="wp-two">
        <div className="wp-card">
          <div className="wp-card-head">
            <Tile name="Wrench" tone="blue" />
            <h3>GoCanvas brings</h3>
          </div>
          <ul className="wp-ticks">
            <Tick>Comes prepared, with a plan built from your SOW and your calls</Tick>
            <Tick>Recommends the workflow, and configures or guides it — whichever fits</Tick>
            <Tick>Brings product and process expertise</Tick>
            <Tick>Keeps the implementation moving</Tick>
          </ul>
        </div>
        <div className="wp-card is-tint">
          <div className="wp-card-head">
            <Tile name="HardHat" tone="blue" />
            <h3>You bring</h3>
          </div>
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
    >
      {j ? (
        <ol className="wp-journey">
          {j.stages.map((s, i) => (
            <li
              key={s.key}
              className={cn(
                "wp-journey-step",
                s.state === "now" && "is-now",
                s.state === "done" && "is-done",
              )}
            >
              <span className="wp-journey-num">
                {s.state === "done" ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : i + 1}
              </span>
              <span className="wp-journey-label">{s.label}</span>
              {s.state === "now" ? <span className="wp-ov-status is-now">You are here</span> : null}
            </li>
          ))}
        </ol>
      ) : (
        <p className="wp-card-body">
          Your path — Intake &amp; Process, Kickoff, Get it working, Make it yours, Make it run,
          Graduate — starts once this account is set up.
        </p>
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
      lede="A few plain signs the implementation is on track."
    >
      <div className="wp-two">
        <div className="wp-card">
          <ul className="wp-ticks">
            <Tick>Your crew submits from the phone, on the job</Tick>
            <Tick>The office sees the work as it happens — nothing retyped</Tick>
            <Tick>A change you ask for gets made, and you see it land</Tick>
          </ul>
        </div>
        <div className="wp-card wp-good">
          <div className="wp-good-cta">
            <span className="wp-good-cta-label">Your next step</span>
            <span className="wp-good-cta-text">{nextText}</span>
          </div>
        </div>
      </div>
    </Frame>
  );
}

/** The Kickoff composition, in order. Never filtered by the customer's
 * persisted hidden-screen preferences — those belong to the Plan
 * composition only. See WelcomePage's `experience` state. */
export function kickoffScreenList(view: WelcomeView): Screen[] {
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
    {
      key: "kickoff-focus",
      label: "What we're working on",
      render: (a) => <KickoffFocus key="kickoff-focus" view={view} page={a.page} />,
    },
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
