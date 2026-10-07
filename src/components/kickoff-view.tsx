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
  kickoffBusinessOutcome,
  kickoffFocusContent,
  kickoffFocusGroups,
  kickoffNextStepText,
  kickoffWorkflowSlide,
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
 * FIVE FIXED SCREENS, always, for every account: Welcome, Your workflow,
 * Our focus, Your path to launch, Let's get it working. Complexity changes
 * the CONTENT within a screen (how much evidence there is to show), never
 * the number of screens — see kickoffScreenList.
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
  return (
    <Frame
      k="kickoff-workflow"
      page={page}
      eyebrow="Your workflow"
      title={story ? "Here's how we see" : "Let's map it"}
      accent={story ? "your workflow" : "together"}
      lede={
        story
          ? "Three moments, start to finish. Did we get it right?"
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
            <p className="wp-journey-quote">{story.before ?? "To confirm on the call."}</p>
          </div>
          <span className="wp-journey-arrow" />
          <div className="wp-journey-col is-then">
            <span className="wp-journey-tag is-blue">In the field</span>
            <div className="wp-journey-art">
              <PhoneMock view={view} className="is-flow" />
            </div>
            <h3>Running the job</h3>
            <p>{story.during ?? "To confirm on the call."}</p>
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

/* ---------------------------------------------------------- 3. Our focus */

function KickoffFocus({ view, page }: { view: WelcomeView; page: number }) {
  const content = kickoffFocusContent(view.implementationFocus, view.implementationFocusFallback);

  if (content.state === "empty") {
    return (
      <Frame
        k="kickoff-focus"
        page={page}
        eyebrow="Our focus"
        title="Let's shape"
        accent="this together"
        lede="We'll agree what we're focused on, together, right here."
      >
        <div className="wp-journey-col is-now is-solo">
          <h3>Nothing locked in yet</h3>
          <p className="wp-journey-quote">We'll agree the focus together on the call.</p>
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
      eyebrow={agreed ? "Agreed focus" : "Proposed focus"}
      title="What we're"
      accent="bringing to life"
      lede={
        agreed
          ? "Agreed together — here's where the implementation is focused."
          : "What we believe we're solving first."
      }
    >
      <div className="wp-focus-now">
        <p className="wp-focus-now-label">Now</p>
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
        <>
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
          <div className="wp-responsibility">
            <div className="wp-responsibility-col">
              <h4>
                <Tile name="Wrench" size="sm" tone="blue" /> GoCanvas
              </h4>
              <p>Prepare · Recommend · Configure · Guide</p>
            </div>
            <div className="wp-responsibility-col">
              <h4>
                <Tile name="HardHat" size="sm" tone="blue" /> You
              </h4>
              <p>Validate · Decide · Test · Adopt</p>
            </div>
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

/* ----------------------------------------------- 5. Let's get it working */

function KickoffNextStep({ view, page }: { view: WelcomeView; page: number }) {
  const nextText = kickoffNextStepText(view.firstForm?.name ?? null);
  return (
    <Frame
      k="kickoff-next"
      page={page}
      eyebrow="Let's get it working"
      title="You're ready"
      accent="to put it to work"
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
      label: "Our focus",
      render: (a) => <KickoffFocus key="kickoff-focus" view={view} page={a.page} />,
    },
    {
      key: "kickoff-journey",
      label: "Your path to launch",
      render: (a) => <KickoffJourney key="kickoff-journey" view={view} page={a.page} />,
    },
    {
      key: "kickoff-next",
      label: "Let's get it working",
      render: (a) => <KickoffNextStep key="kickoff-next" view={view} page={a.page} />,
    },
  ];
}
