import { Fragment } from "react";
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
  KICKOFF_HANDOFF,
  KICKOFF_JOURNEY_BAND,
  KICKOFF_PRINCIPLES,
  KICKOFF_PROMISE,
  KICKOFF_RESPONSIBILITY,
  KICKOFF_STAGE_OUTCOME,
  KICKOFF_WORKFLOW_PROMPTS,
  kickoffBusinessOutcome,
  kickoffBusinessOutcomeConfirmed,
  kickoffFocusContent,
  kickoffJourneyStages,
  kickoffNextStepText,
  kickoffWorkflowSlide,
  kickoffWorkflowToConfirm,
} from "@/lib/kickoff-view";
import { shortDay } from "@/lib/onboarding-timeline";
import { byLabel } from "@/lib/welcome-journey";
import { cn } from "@/lib/utils";
import type { WelcomeView } from "@/lib/welcome";

/**
 * KICKOFF VIEW — a TIS-led CONVERSATION SCAFFOLD for the first
 * implementation call, composed from the same WelcomeView the living Plan
 * already reads. One implementation, two views: this file adds the second
 * composition, never a second data model. Internal only — nothing here is
 * reachable from the customer's shared link.
 *
 * SIX FIXED SCREENS, always, for every account: Welcome, Your workflow,
 * Your implementation journey, How we'll keep things moving, Form V1,
 * Your next move.
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
          {view.firstForm && view.firstFormSource === "ai" ? (
            // Read from the SOW or the calls, never chosen by a person yet:
            // the customer hears it as a question, not a decision.
            <p className="wp-prepared">
              <T k="kickoff-cover.form-confirm">
                The form we read from your paperwork — we&apos;ll confirm it today
              </T>
            </p>
          ) : null}
          <p className="wp-cover-name">
            <T k="kickoff-cover.name">{view.clientName}</T>
          </p>
          {outcome ? (
            <p className="wp-lede">
              <T k="kickoff-cover.outcome">{outcome}</T>
            </p>
          ) : null}
          {outcome && !outcomeConfirmed ? (
            // Read from the calls, or typed by Sales: theirs to confirm today.
            <p className="wp-prepared">
              <T k="kickoff-cover.outcome-confirm">What we heard — we&apos;ll confirm it today</T>
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
            ? "What we think we know, and what we'll confirm together — the foundation for your first working version."
            : "How the work runs, in your words — the foundation for your first working version."
          : "There's not enough yet to sketch this out — we'll build it on the call."
      }
    >
      {story ? (
        <div className="wp-journey">
          <div className="wp-journey-col is-now">
            <span className="wp-journey-tag">{toConfirm ? "Today · to confirm" : "Today"}</span>
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

function KickoffScopeSummary({ view }: { view: WelcomeView }) {
  const content = kickoffFocusContent(view.implementationFocus, view.implementationFocusFallback);
  return (
    <section className="wp-kickoff-scope">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="wp-focus-now-label">Kickoff scope · {content.state}</p>
        <div className="wp-pills is-compact">
          {KICKOFF_PRINCIPLES.map((p) => (
            <span className="wp-pill" key={p.label}>
              <Tile name={p.icon} size="sm" tone="blue" /> {p.label}
            </span>
          ))}
        </div>
      </div>
      {content.state === "empty" ? (
        <p className="wp-journey-quote">No deliverables are recorded yet. Confirm the first objective together.</p>
      ) : (
        <ul className="wp-ticks">
          {content.items.map((text, index) => (
            <Tick key={`${index}-${text}`}>{text}</Tick>
          ))}
        </ul>
      )}
      {content.state === "proposed" ? (
        <p className="wp-focus-prompt">Review and confirm the deliverables for this kickoff.</p>
      ) : null}
      <p className="wp-prepared">Kickoff scope confirmation is separate from formal Graduation acceptance.</p>
    </section>
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
              {j && stages.length ? (
                </span>
                <span className={cn("wp-node-tile", s.state === "done" && "is-done")}>
                  <Tile
                    name={STAGE_ICON[s.key] ?? "Route"}
                    size="lg"
                        {s.state === "now" ? (
                          <i className="wp-today-tag">{s.key === "kickoff" ? "TODAY" : "You are here"}</i>
                        ) : null}
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
      title="Clear owners,"
      accent="steady progress"
      lede="We keep decisions, responsibilities and dates visible as the work moves."
    >
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
      <div className="wp-focus-later">
        <div className="wp-focus-later-col">
          <h4>Communication</h4>
          <ul className="wp-ticks">
            <Tick>{view.lead ? `${view.lead} is your GoCanvas project lead.` : "Confirm your GoCanvas project lead and first contact."}</Tick>
            <Tick>Raise blockers early; agree the next action, owner and date together.</Tick>
            <Tick>If a response delay affects a target, record the reason and agree the new target. Meeting dates change only when rebooked.</Tick>
          </ul>
        </div>
        <div className="wp-focus-later-col">
          <h4>Scope and response timing</h4>
          <ul className="wp-ticks">
            <Tick>Kickoff confirms the initial deliverables; Graduation acceptance is a later, separate decision.</Tick>
            <Tick>Record new requests, review their impact, and agree any scope or target change before work is redirected.</Tick>
            <Tick>If the signed agreement includes a 10-business-day response term, confirm and use its exact wording.</Tick>
          </ul>
        </div>
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
  return (
    <Frame
      k="kickoff-form-v1"
      page={page}
      eyebrow="Let's work on Form V1"
      title={view.firstForm?.name ?? "Form V1"}
      accent="review together"
      lede={view.firstForm?.objective ?? "Review the actual form, make agreed edits in GoCanvas, and prepare a real-job test."}
    >
      <div className="wp-journey">
        <div className="wp-journey-col is-now">
          <span className="wp-journey-tag">Starting point</span>
          <div className="wp-journey-art">
            <PhoneMock view={view} className="is-flow" />
          </div>
          <h3>{view.firstForm?.name ?? "Form not named yet"}</h3>
          <p>{view.firstForm ? `Source: ${view.firstForm.source}` : "Name the form to review before making changes."}</p>
          {view.formArtifacts.length && internal ? (
            <ul className="wp-ticks">
              {view.formArtifacts.map((file) => (
                <li key={file.url}>
                  <a href={file.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">
                    <ExternalLink className="h-3 w-3" /> Open {file.name}
                  </a>
                </li>
              ))}
            </ul>
          ) : view.firstForm?.source === "uploaded" ? (
            <p className="wp-prepared">The uploaded form is not available to open from this view.</p>
          ) : null}
        </div>
        <span className="wp-journey-arrow" />
        <div className="wp-journey-col is-then">
          <span className="wp-journey-tag is-blue">Review live</span>
          <h3>Agree the V1 edits</h3>
          <ul className="wp-ticks">
            <Tick>Walk the fields and steps against the workflow you just confirmed.</Tick>
            <Tick>Make the changes you agree in the GoCanvas form while you are together.</Tick>
            <Tick>Record anything remaining with an owner and deadline; do not treat it as accepted yet.</Tick>
          </ul>
        </div>
        <span className="wp-journey-arrow" />
        <div className="wp-journey-col is-future">
          <span className="wp-journey-tag is-navy">Real-world test</span>
          <h3>Prepare one real job</h3>
          <p>
            {view.fieldTester
              ? `${view.fieldTester} is named to test the form.`
              : "Testing owner not named yet."}
          </p>
          <p>Confirm the job, device and feedback path before the test begins.</p>
        </div>
      </div>
      <div className="wp-focus-later">
        <div className="wp-focus-later-col">
          <h4>Remaining changes already recorded</h4>
          {openChanges.length ? (
            <ul className="wp-ticks">
              {openChanges.slice(0, 4).map((item, index) => (
                <Tick key={`${item.request}-${index}`}>
                  {item.request}{item.target ? ` · ${item.target}` : ""}
                </Tick>
              ))}
            </ul>
          ) : (
            <p>No remaining form changes are recorded yet.</p>
          )}
        </div>
        <div className="wp-focus-later-col">
          <h4>Close this review</h4>
          <div className="wp-handoff">
            {KICKOFF_HANDOFF.map((step, index) => (
              <Fragment key={step.label}>
                <span className="wp-handoff-step">
                  <b>{step.label}</b>
                  {step.text}
                </span>
                {index < KICKOFF_HANDOFF.length - 1 ? <span className="wp-handoff-arrow" /> : null}
              </Fragment>
            ))}
          </div>
        </div>
      </div>
    </Frame>
  );
}

/* ----------------------------------------------------- 6. Your next move */

function KickoffNextMove({ view, page }: { view: WelcomeView; page: number }) {
  const calls = view.timeline.milestones
    .filter((milestone) => milestone.kind === "call" && !milestone.serviceId)
    .slice(0, 3);
  const booked = calls.filter((milestone) => Boolean(milestone.time)).length;
  const actions = (view.journey?.yours ?? []).filter((item) => item.kind !== "meeting").slice(0, 4);
  const sideLabel = (side: "customer" | "gocanvas" | "both") =>
    side === "customer" ? "Customer team" : side === "gocanvas" ? "GoCanvas team" : "Both teams";
  const nextText = kickoffNextStepText(view.firstForm?.name ?? null);

  return (
    <Frame
      k="kickoff-next"
      page={page}
      eyebrow="Your next move"
      title="Leave with"
      accent="clear commitments"
      lede="Name the action, owner and deadline before the room wraps."
    >
      <div className="wp-focus-later">
        <div className="wp-focus-later-col">
                  <h4>
                    {calls.length
                      ? `Working sessions · ${booked} of ${calls.length} booked`
                      : "Working sessions · not scheduled"}
                  </h4>
          {calls.length ? (
            <ul className="wp-ticks">
              {calls.map((call) => (
                <Tick key={call.key}>
                  {call.key === "kickoff" ? "TODAY · " : ""}{call.label} ·{" "}
                  {call.time
                    ? `${shortDay(call.date)} at ${call.time}${view.timeline.timezone ? ` ${view.timeline.timezone}` : ""}`
                    : "Date and time not booked"}
                </Tick>
              ))}
            </ul>
          ) : (
            <p>No working sessions are on this plan.</p>
          )}
        </div>
        <div className="wp-focus-later-col">
          <h4>Actions</h4>
          {actions.length ? (
            <ul className="wp-ticks">
              {actions.map((action, index) => (
                <Tick key={`${action.kind}-${index}`}>
                  {action.what} · {action.ownerName ?? `${sideLabel(action.ownerSide)} · person not named`} ·{" "}
                  {action.by ? byLabel(action.by) : "Deadline not set"}
                </Tick>
              ))}
            </ul>
          ) : (
            <p>No follow-up actions are recorded yet.</p>
          )}
        </div>
      </div>
      <div className="wp-responsibility is-three">
        <div className="wp-responsibility-col">
          <h4>Testing owner</h4>
          <p>{view.fieldTester ?? "Not named"}</p>
        </div>
        <div className="wp-responsibility-col">
          <h4>Testing deadline</h4>
          <p>{view.fieldTesterDue ? shortDay(view.fieldTesterDue) : "Not set"}</p>
        </div>
        <div className="wp-responsibility-col">
          <h4>Deliverables</h4>
          <p>
            {view.implementationFocus?.validatedAt
              ? "Kickoff scope confirmed"
              : "Review and confirm kickoff scope"}
          </p>
        </div>
      </div>
      <KickoffScopeSummary view={view} />
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
        <KickoffFormV1 key="kickoff-form-v1" view={view} page={a.page} internal={a.mode === "internal"} />
      ),
    },
    {
      key: "kickoff-next",
      label: "Your next move",
      render: (a) => <KickoffNextMove key="kickoff-next" view={view} page={a.page} />,
    },
  ];
}
