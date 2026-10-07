import { Fragment } from "react";
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
import {
  KICKOFF_HANDOFF,
  KICKOFF_JOURNEY_BAND,
  KICKOFF_PRINCIPLES,
  KICKOFF_PROMISE,
  KICKOFF_RESPONSIBILITY,
  KICKOFF_STAGE_OUTCOME,
  KICKOFF_WORKFLOW_PROMPTS,
  kickoffBusinessOutcome,
  kickoffFocusContent,
  kickoffFocusGroups,
  kickoffJourneyStages,
  kickoffNextStepText,
  kickoffWorkflowSlide,
} from "@/lib/kickoff-view";
import { shortDay } from "@/lib/onboarding-timeline";
import { cn } from "@/lib/utils";
import type { WelcomeView } from "@/lib/welcome";

/**
 * KICKOFF VIEW — a TIS-led CONVERSATION SCAFFOLD for the first
 * implementation call, composed from the same WelcomeView the living Plan
 * already reads. One implementation, two views: this file adds the second
 * composition, never a second data model. Internal only — nothing here is
 * reachable from the customer's shared link.
 *
 * FIVE FIXED SCREENS, always, for every account: Welcome, Your workflow,
 * What we're getting working first, Your path to launch, Put it to work.
 * Complexity changes the CONTENT within a screen, never the number of
 * screens — see kickoffScreenList.
 *
 * This is not primarily a customer summary deck — it is what the TIS uses
 * to RUN the call: it tells the customer what today accomplishes, carries
 * the TIS's own before/during/after question framework next to whatever
 * customer-specific evidence already exists, explains WHY we deliberately
 * get one workflow working well before expanding, and explains how
 * implementation actually proceeds after today. The reusable conversation
 * prompts and framing (KICKOFF_* in @/lib/kickoff-view) are static
 * Kickoff-methodology copy — never customer facts, never persisted, never
 * account-specific.
 *
 * Visually, every screen reuses the Plan deck's own grammar — Frame, Tile,
 * Tick, PhoneMock, the journey-flow columns, the milestone rail, the
 * orange "good" CTA — recomposed per screen rather than repeating one card
 * layout five times. The copy stays the Phase 3 narrative: no fixed call
 * counts, no "Functional", no provenance ever rendered to a customer. The
 * closing motion is USE IT → TEST IT → VALIDATE IT, never an
 * administrative ask.
 */

/* ---------------------------------------------------------- 1. Welcome */

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
          {/* What today's call accomplishes — a light promise, not an agenda. */}
          <div style={{ marginTop: 10 }}>
            <p className="wp-eyebrow" style={{ marginBottom: 6 }}>
              Today we&apos;ll
            </p>
            <div className="wp-pills is-compact">
              {KICKOFF_PROMISE.map((item) => (
                <span className="wp-pill" key={item.text}>
                  <Tile name={item.icon} size="sm" tone="blue" /> {item.text}
                </span>
              ))}
            </div>
          </div>
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

/* ----------------------------------------------------- 2. Your workflow */

function KickoffWorkflow({ view, page }: { view: WelcomeView; page: number }) {
  const story = kickoffWorkflowSlide({
    workflowStory: view.workflowStory,
    currentProcess: view.currentProcess,
    firstFormName: view.firstForm?.name ?? null,
    businessOutcome: kickoffBusinessOutcome(view),
  });
  const confirm = KICKOFF_WORKFLOW_PROMPTS;
  return (
    <Frame
      k="kickoff-workflow"
      page={page}
      eyebrow="Your workflow"
      title={story ? "Here's how we see" : "Let's map it"}
      accent={story ? "your workflow" : "together"}
      lede={
        story
          ? "What we think we know, and what we'll confirm together — the foundation for your first working version."
          : "There's not enough yet to sketch this out — we'll build it on the call."
      }
    >
      {story ? (
        <div className="wp-journey">
          <div className="wp-journey-col is-now">
            <span className="wp-journey-tag">Today</span>
            <div className="wp-journey-art">
              <div className="wp-paper">
                <FileText className="h-7 w-7" />
              </div>
            </div>
            <h3>How it starts</h3>
            <p className="wp-journey-quote">{story.before ?? "Let's confirm this together."}</p>
            <div className="wp-journey-confirm">
              <p className="wp-journey-confirm-label">We&apos;ll confirm</p>
              <ul className="wp-journey-confirm-list">
                {confirm.before.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
            </div>
          </div>
          <span className="wp-journey-arrow" />
          <div className="wp-journey-col is-then">
            <span className="wp-journey-tag is-blue">In the field</span>
            <div className="wp-journey-art">
              <PhoneMock view={view} className="is-flow" />
            </div>
            <h3>Running the job</h3>
            <p>{story.during ?? "Let's confirm this together."}</p>
            <div className="wp-journey-confirm">
              <p className="wp-journey-confirm-label">We&apos;ll confirm</p>
              <ul className="wp-journey-confirm-list">
                {confirm.during.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
            </div>
          </div>
          <span className="wp-journey-arrow" />
          <div className="wp-journey-col is-future">
            <span className="wp-journey-tag is-navy">Business result</span>
            <div className="wp-journey-art">
              <div className="wp-office">
                <span className="wp-office-tile">
                  <Cloud className="h-6 w-6" />
                </span>
              </div>
            </div>
            <h3>What changes</h3>
            <p>{story.after ?? "Let's confirm this together."}</p>
            <div className="wp-journey-confirm">
              <p className="wp-journey-confirm-label">We&apos;ll confirm</p>
              <ul className="wp-journey-confirm-list">
                {confirm.after.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
            </div>
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

/* ---------------------------------- 3. What we're getting working first */

function KickoffFocus({ view, page }: { view: WelcomeView; page: number }) {
  const content = kickoffFocusContent(view.implementationFocus, view.implementationFocusFallback);

  const principles = (
    <div className="wp-pills">
      {KICKOFF_PRINCIPLES.map((p) => (
        <span className="wp-pill" key={p.label}>
          <Tile name={p.icon} size="sm" tone="blue" /> {p.label}
        </span>
      ))}
    </div>
  );

  if (content.state === "empty") {
    return (
      <Frame
        k="kickoff-focus"
        page={page}
        eyebrow="What we're getting working first"
        title="One workflow,"
        accent="done right"
        lede="We get one thing working well before we expand — on purpose."
      >
        {principles}
        <div className="wp-journey-col is-now is-solo" style={{ marginTop: 20 }}>
          <h3>Nothing locked in yet</h3>
          <p className="wp-journey-quote">We'll agree the first objective together on the call.</p>
        </div>
      </Frame>
    );
  }

  const agreed = content.state === "agreed";
  const groups = kickoffFocusGroups(content.items);
  return (
    <Frame
      k="kickoff-focus"
      page={page}
      eyebrow="What we're getting working first"
      title="One workflow,"
      accent="done right"
      lede="We get one thing working well before we expand — on purpose."
    >
      {principles}
      <div className="wp-focus-now" style={{ marginTop: 18 }}>
        <p className="wp-focus-now-label">
          {agreed ? "Agreed first objective" : "First objective"}
        </p>
        <p className="wp-focus-now-text">{groups.now[0]}</p>
      </div>
      {groups.next.length || groups.later.length ? (
        <div className="wp-focus-later">
          {groups.next.length ? (
            <div className="wp-focus-later-col">
              <h4>Next</h4>
              <ul className="wp-ticks">
                {groups.next.map((text, i) => (
                  <Tick key={i}>{text}</Tick>
                ))}
              </ul>
            </div>
          ) : null}
          {groups.later.length ? (
            <div className="wp-focus-later-col">
              <h4>Later</h4>
              <ul className="wp-ticks">
                {groups.later.map((text, i) => (
                  <Tick key={i}>{text}</Tick>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
      {!agreed ? <p className="wp-focus-prompt">Did we get this right?</p> : null}
    </Frame>
  );
}

/* --------------------------------------------------- 4. Your path to launch */

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
  const stages = j ? kickoffJourneyStages(j) : [];
  return (
    <Frame
      k="kickoff-journey"
      page={page}
      eyebrow="Your path to launch"
      title="Dates create"
      accent="accountability"
      lede="Outcomes move stages. Meetings support the work."
      {...(j ? { band: KICKOFF_JOURNEY_BAND, bandIcon: "Route" } : {})}
    >
      {j ? (
        <>
          <div className="wp-rail is-six">
            <div className="wp-rail-line" />
            {stages.map((s) => (
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
                {KICKOFF_STAGE_OUTCOME[s.key] ? (
                  <span className="wp-node-detail">{KICKOFF_STAGE_OUTCOME[s.key]}</span>
                ) : null}
                {s.key === "complete" && view.timeline.liveDate ? (
                  <span className="wp-node-date">{shortDay(view.timeline.liveDate)}</span>
                ) : null}
              </div>
            ))}
          </div>
          <div className="wp-responsibility is-three">
            {KICKOFF_RESPONSIBILITY.map((r) => (
              <div className="wp-responsibility-col" key={r.label}>
                <h4>
                  <Tile name={r.icon} size="sm" tone="blue" /> {r.label}
                </h4>
                <p>{r.items}</p>
              </div>
            ))}
          </div>
        </>
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

/* ----------------------------------------------- 5. Put it to work */

function KickoffNextStep({ view, page }: { view: WelcomeView; page: number }) {
  const nextText = kickoffNextStepText(view.firstForm?.name ?? null);
  return (
    <Frame
      k="kickoff-next"
      page={page}
      eyebrow="Put it to work"
      title="What happens"
      accent="after today"
    >
      <div className="wp-handoff">
        {KICKOFF_HANDOFF.map((step, i) => (
          <Fragment key={step.label}>
            <span className="wp-handoff-step">
              <b>{step.label}</b>
              {step.text}
            </span>
            {i < KICKOFF_HANDOFF.length - 1 ? <span className="wp-handoff-arrow" /> : null}
          </Fragment>
        ))}
      </div>
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

/** The Kickoff composition: five fixed screens, always, in this order.
 * Complexity changes what a screen shows, never how many screens there
 * are — see each screen's own fallback handling above. Never filtered by
 * the customer's persisted hidden-screen preferences — those belong to
 * the Plan composition only. See WelcomePage's `experience` state. */
export function kickoffScreenList(view: WelcomeView): Screen[] {
  return [
    {
      key: "kickoff-cover",
      label: "Welcome",
      render: () => <KickoffCover key="kickoff-cover" view={view} />,
    },
    {
      key: "kickoff-workflow",
      label: "Your workflow",
      render: (a) => <KickoffWorkflow key="kickoff-workflow" view={view} page={a.page} />,
    },
    {
      key: "kickoff-focus",
      label: "What we're getting working first",
      render: (a) => <KickoffFocus key="kickoff-focus" view={view} page={a.page} />,
    },
    {
      key: "kickoff-journey",
      label: "Your path to launch",
      render: (a) => <KickoffJourney key="kickoff-journey" view={view} page={a.page} />,
    },
    {
      key: "kickoff-next",
      label: "Put it to work",
      render: (a) => <KickoffNextStep key="kickoff-next" view={view} page={a.page} />,
    },
  ];
}
