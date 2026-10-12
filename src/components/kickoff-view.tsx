import { Check, Cloud, ExternalLink, FileText } from "lucide-react";

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
  KICKOFF_CHANGE_RULE,
  KICKOFF_FORM_STEPS,
  KICKOFF_JOURNEY_BAND,
  KICKOFF_PROMISE,
  KICKOFF_RESPONSIBILITY,
  KICKOFF_STAGE_OUTCOME,
  kickoffBusinessOutcome,
  kickoffBusinessOutcomeConfirmed,
  kickoffFocusContent,
  kickoffJourneyStages,
  kickoffNextStepText,
  kickoffWorkflowSlide,
  kickoffWorkflowToConfirm,
  stableSignedUrl,
} from "@/lib/kickoff-view";
import { shortDay } from "@/lib/onboarding-timeline";
import { sessionsAfterKickoff } from "@/lib/presenter-workspace";
import { byLabel } from "@/lib/welcome-journey";
import { cn } from "@/lib/utils";
import type { WelcomeView } from "@/lib/welcome";

/**
 * KICKOFF VIEW — the six customer-facing Kickoff slides, composed from the
 * same WelcomeView the living Plan already reads. One implementation, two
 * views: this file adds the second composition, never a second data model.
 *
 * SIX FIXED SCREENS, always, for every account: Welcome, Your workflow,
 * Your implementation journey, How we'll keep things moving, Form V1,
 * Your next move. Complexity changes the CONTENT within a screen, never the
 * number of screens — see kickoffScreenList.
 *
 * Every slide shows only what the Hub already holds. A missing answer is
 * labelled as something to confirm together, never filled in. Internal
 * instructions for the TIS live in the Presenter Workspace, not here.
 */

/** Long saved answers keep their full text; the slide sets them smaller so they still fit. */
const longText = (text: string | null) => (text && text.length > 240 ? "is-long" : undefined);

/* ---------------------------------------------------------- 1. Welcome */

function KickoffCover({ view }: { view: WelcomeView }) {
  const workflowName = view.firstForm?.name ?? "your workflow";
  const outcome = kickoffBusinessOutcome(view);
  const outcomeConfirmed = kickoffBusinessOutcomeConfirmed(view);
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
            <>
              <p className="wp-eyebrow">Your goal</p>
              <p className="wp-lede">
                <T k="kickoff-cover.outcome">{outcome}</T>
              </p>
              {!outcomeConfirmed ? (
                // Read from the calls, or typed by Sales: theirs to confirm today.
                <p className="wp-prepared">
                  <T k="kickoff-cover.outcome-confirm">
                    What we heard — we&apos;ll confirm it today
                  </T>
                </p>
              ) : null}
            </>
          ) : null}
          {view.firstForm && view.firstFormSource === "ai" ? (
            // Read from the SOW or the calls, never chosen by a person yet:
            // the customer hears it as a question, not a decision.
            <p className="wp-prepared">
              <T k="kickoff-cover.form-confirm">
                The form we read from your paperwork — we&apos;ll confirm it today
              </T>
            </p>
          ) : null}
          <p className="wp-prepared">
            {[
              view.timeline.liveDate ? `Target ${shortDay(view.timeline.liveDate)}` : null,
              view.lead ? `Prepared by ${view.lead}, GoCanvas onboarding` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
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
  const toConfirm = kickoffWorkflowToConfirm(view.workflowStory);
  return (
    <Frame
      k="kickoff-workflow"
      page={page}
      eyebrow={toConfirm ? "Your workflow · to confirm" : "Your workflow"}
      title={story ? "Here's how we see" : "Let's map it"}
      accent={story ? "your workflow" : "together"}
      lede={
        story
          ? toConfirm
            ? "What we understand so far. We'll check each part with you."
            : "How the work runs, in your words."
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
            <p className={cn("wp-workflow-text", longText(story.before))}>
              {story.before ?? "To confirm together"}
            </p>
          </div>
          <span className="wp-journey-arrow" />
          <div className="wp-journey-col is-then">
            <span className="wp-journey-tag is-blue">During</span>
            <div className="wp-journey-art">
              <PhoneMock view={view} className="is-flow" />
            </div>
            <h3>Running the job</h3>
            <p className={cn("wp-workflow-text", longText(story.during))}>
              {story.during ?? "To confirm together"}
            </p>
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
            <h3>What changes</h3>
            <p className={cn("wp-workflow-text", longText(story.after))}>
              {story.after ?? "To confirm together"}
            </p>
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

/* --------------------------------------------------- 3. Your journey */

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
      title="Your journey from"
      accent="kickoff to go-live"
      lede="Each stage has one job. The dates are the targets we have agreed."
      {...(j ? { band: KICKOFF_JOURNEY_BAND, bandIcon: "Route" } : {})}
    >
      {j ? (
        <>
          <div className="wp-rail is-six">
            <div className="wp-rail-line" />
            {stages.map((s) => (
              <div key={s.key} className={cn("wp-node", s.state === "now" && "is-today")}>
                <span className="wp-node-day">
                  {s.state === "now" ? (
                    <i className="wp-today-tag">{s.key === "kickoff" ? "TODAY" : "You are here"}</i>
                  ) : null}
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
                {s.target ? (
                  <span className="wp-node-date">
                    {s.target.currentDate
                      ? `Target ${shortDay(s.target.currentDate)}`
                      : "Target to agree"}
                    {s.target.actualDate ? ` · Completed ${shortDay(s.target.actualDate)}` : ""}
                  </span>
                ) : null}
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

/* ------------------------------------ 4. How we'll keep things moving */

function KickoffKeepMoving({ view, page }: { view: WelcomeView; page: number }) {
  return (
    <Frame
      k="kickoff-communication"
      page={page}
      eyebrow="How we'll keep things moving"
      title="What to expect"
      accent="from one another"
      lede="A working agreement: what each side brings, and how we decide together."
    >
      <div className="wp-responsibility is-three">
        {KICKOFF_RESPONSIBILITY.map((r) => (
          <div className="wp-responsibility-col" key={r.label}>
            <h4>
              <Tile name={r.icon} size="sm" tone="blue" /> {r.label}
            </h4>
            <ul className="wp-agreement-list">
              {r.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="wp-agreement-foot">
        <p>
          <span className="wp-agreement-label">Your GoCanvas lead</span>
          {view.lead ?? "To be named on the call"}
        </p>
        <p>
          <span className="wp-agreement-label">Blockers</span>
          Raise them early. Every next action has an owner and a date.
        </p>
        <p>
          <span className="wp-agreement-label">Changes</span>
          {KICKOFF_CHANGE_RULE}
        </p>
      </div>
    </Frame>
  );
}

/* ---------------------------------------------- 5. Let's work on Form V1 */

function KickoffFormV1({
  view,
  page,
  internal,
}: {
  view: WelcomeView;
  page: number;
  internal: boolean;
}) {
  const openChanges = (view.parkingLot ?? []).filter((item) => item.status !== "done");
  const shot = view.formScreenshotUrl ? stableSignedUrl(view.formScreenshotUrl) : null;
  const testerLine = view.fieldTester
    ? `${view.fieldTester} tests the form${view.fieldTesterDue ? ` by ${shortDay(view.fieldTesterDue)}` : ""}.`
    : "Testing owner not named yet.";
  const changes = (
    <div className="wp-changes">
      <h4>Changes before the test</h4>
      {openChanges.length ? (
        <ul className="wp-ticks">
          {openChanges.slice(0, 4).map((item, index) => (
            <Tick key={`${item.request}-${index}`}>
              {item.request}
              <span className="wp-change-meta">
                {" "}
                · {item.status === "scheduled" ? "Scheduled" : "Open"}
                {item.target ? ` · ${item.target}` : ""}
              </span>
            </Tick>
          ))}
        </ul>
      ) : (
        <p>No changes recorded yet.</p>
      )}
    </div>
  );

  if (shot) {
    return (
      <Frame
        k="kickoff-form-v1"
        page={page}
        eyebrow="Let's work on Form V1"
        title={view.firstForm?.name ?? "Form V1"}
        accent=""
      >
        <div className="wp-shot-layout">
          <figure className="wp-shot">
            <img
              src={shot}
              data-form-screenshot="true"
              alt={`Screenshot of ${view.firstForm?.name ?? "the first form"}`}
            />
          </figure>
          <div className="wp-shot-side">
            <ol className="wp-form-steps">
              {KICKOFF_FORM_STEPS.map((step, index) => (
                <li key={step.label}>
                  <span className="wp-step-no">{index + 1}</span>
                  <span>
                    <b>{step.label}</b>
                    {step.text}
                  </span>
                </li>
              ))}
            </ol>
            <p className="wp-testing-line">{testerLine}</p>
            {changes}
            {view.formArtifacts.length && internal ? (
              <ul className="wp-ticks">
                {view.formArtifacts.map((file) => (
                  <li key={file.url}>
                    <a
                      href={file.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 underline"
                    >
                      <ExternalLink className="h-3 w-3" /> Open {file.name}
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      </Frame>
    );
  }

  return (
    <Frame
      k="kickoff-form-v1"
      page={page}
      eyebrow="Let's work on Form V1"
      title={view.firstForm?.name ?? "Form V1"}
      accent="review together"
      lede={
        view.firstForm?.objective ??
        "Review the actual form, make agreed edits in GoCanvas, and prepare a real-job test."
      }
    >
      <div className="wp-journey">
        <div className="wp-journey-col is-now">
          <span className="wp-journey-tag">Step 1</span>
          <div className="wp-journey-art">
            <PhoneMock view={view} className="is-flow" />
          </div>
          <h3>{KICKOFF_FORM_STEPS[0]!.label}</h3>
          <p>
            {view.firstForm
              ? `Source: ${view.firstForm.source}`
              : "Name the form to review before making changes."}
          </p>
          {view.formArtifacts.length && internal ? (
            <ul className="wp-ticks">
              {view.formArtifacts.map((file) => (
                <li key={file.url}>
                  <a
                    href={file.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 underline"
                  >
                    <ExternalLink className="h-3 w-3" /> Open {file.name}
                  </a>
                </li>
              ))}
            </ul>
          ) : view.firstForm?.source === "uploaded" ? (
            <p className="wp-prepared">
              The uploaded form is not available to open from this view.
            </p>
          ) : null}
        </div>
        <span className="wp-journey-arrow" />
        <div className="wp-journey-col is-then">
          <span className="wp-journey-tag is-blue">Step 2</span>
          <h3>{KICKOFF_FORM_STEPS[1]!.label}</h3>
          <p>{KICKOFF_FORM_STEPS[1]!.text}</p>
        </div>
        <span className="wp-journey-arrow" />
        <div className="wp-journey-col is-future">
          <span className="wp-journey-tag is-navy">Step 3</span>
          <h3>{KICKOFF_FORM_STEPS[2]!.label}</h3>
          <p>{testerLine}</p>
          <p>{KICKOFF_FORM_STEPS[2]!.text}</p>
        </div>
      </div>
      {changes}
    </Frame>
  );
}

/* ----------------------------------------------------- 6. Your next move */

/** The scope being agreed today: proposed until it is confirmed, never presented as settled. */
function KickoffScope({ view }: { view: WelcomeView }) {
  const content = kickoffFocusContent(view.implementationFocus, view.implementationFocusFallback);
  if (content.state === "empty") {
    return (
      <p className="wp-next-note">Nothing recorded yet. We agree the first deliverables today.</p>
    );
  }
  const agreed = content.state === "agreed";
  const shown = content.items.slice(0, 4);
  const more = content.items.length - shown.length;
  return (
    <>
      <span className={cn("wp-next-tag", agreed ? "is-agreed" : "is-proposed")}>
        {agreed ? "Agreed scope" : "Proposed · to confirm today"}
      </span>
      <ul className="wp-next-list">
        {shown.map((text, index) => (
          <li key={`${index}-${text}`}>{text}</li>
        ))}
      </ul>
      {more > 0 ? <p className="wp-next-note">+{more} more</p> : null}
    </>
  );
}

function KickoffNextMove({ view, page }: { view: WelcomeView; page: number }) {
  const calls = sessionsAfterKickoff(view.timeline.milestones);
  const booked = calls.filter((call) => call.booked).length;
  const actions = (view.journey?.yours ?? []).filter((item) => item.kind !== "meeting").slice(0, 3);
  const sideLabel = (side: "customer" | "gocanvas" | "both") =>
    side === "customer" ? "Your team" : side === "gocanvas" ? "GoCanvas" : "Both teams";
  const nextText = kickoffNextStepText(view.firstForm?.name ?? null);

  return (
    <Frame
      k="kickoff-next"
      page={page}
      eyebrow="Your next move"
      title="Who's doing what,"
      accent="and by when"
      lede="The sessions, owners and dates we are agreeing today."
    >
      <div className="wp-next-grid">
        <section className="wp-next-card">
          <h4>
            {calls.length
              ? `Working sessions · ${booked} of ${calls.length} booked`
              : "Working sessions · none on the plan"}
          </h4>
          <ul className="wp-next-list">
            {calls.map((call) =>
              call.booked ? (
                <li key={call.key}>
                  <b>{call.label}</b> · {shortDay(call.date)} at {call.time}
                  {view.timeline.timezone ? ` ${view.timeline.timezone}` : ""}
                </li>
              ) : (
                <li key={call.key} className="is-open">
                  <b>{call.label}</b> · Not booked yet
                </li>
              ),
            )}
          </ul>
        </section>
        <section className="wp-next-card">
          <h4>Next actions</h4>
          {actions.length ? (
            <ul className="wp-next-list">
              {actions.map((action, index) => (
                <li key={`${action.kind}-${index}`}>
                  <b>{action.what}</b>
                  <span className="wp-next-meta">
                    {" "}
                    · {action.ownerName ?? `${sideLabel(action.ownerSide)}, owner to name`} ·{" "}
                    {action.by ? byLabel(action.by) : "Date to agree"}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="wp-next-note">No follow-up actions recorded yet.</p>
          )}
        </section>
        <section className="wp-next-card">
          <h4>Testing</h4>
          <p className="wp-next-line">
            <b>{view.fieldTester ?? "Owner to name"}</b>
            <span className="wp-next-meta">
              {" "}
              · {view.fieldTesterDue ? shortDay(view.fieldTesterDue) : "Deadline to set"}
            </span>
          </p>
        </section>
        <section className="wp-next-card">
          <h4>Kickoff scope</h4>
          <KickoffScope view={view} />
          <p className="wp-next-note">
            Agreeing scope today is separate from formal Graduation acceptance.
          </p>
        </section>
      </div>
      <div className="wp-good-cta is-hero">
        <span className="wp-good-cta-label">Real-world test</span>
        <span className="wp-good-cta-text">{nextText}</span>
      </div>
    </Frame>
  );
}

/** The Kickoff composition: six fixed screens, always, in this order.
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
      key: "kickoff-journey",
      label: "Your implementation journey",
      render: (a) => <KickoffJourney key="kickoff-journey" view={view} page={a.page} />,
    },
    {
      key: "kickoff-communication",
      label: "How we'll keep things moving",
      render: (a) => <KickoffKeepMoving key="kickoff-communication" view={view} page={a.page} />,
    },
    {
      key: "kickoff-form-v1",
      label: "Let's work on Form V1",
      render: (a) => (
        <KickoffFormV1
          key="kickoff-form-v1"
          view={view}
          page={a.page}
          internal={a.mode === "internal"}
        />
      ),
    },
    {
      key: "kickoff-next",
      label: "Your next move",
      render: (a) => <KickoffNextMove key="kickoff-next" view={view} page={a.page} />,
    },
  ];
}
