import { Fragment } from "react";
import { Check } from "lucide-react";

import { Frame, Icon, PhoneMock, T, Tile, type Screen } from "@/components/welcome-primitives";
import {
  KICKOFF_EXPECTATIONS,
  KICKOFF_FORM_STEPS,
  KICKOFF_LONG_TEXT,
  KICKOFF_NEXT_HEADLINE,
  KICKOFF_NEXT_LEDE,
  KICKOFF_PROMISE,
  KICKOFF_STAGE_OUTCOME,
  KICKOFF_TO_CONFIRM,
  KICKOFF_UPCOMING,
  KICKOFF_WORKFLOW_QUESTIONS,
  kickoffBusinessOutcome,
  kickoffBusinessOutcomeConfirmed,
  kickoffChanges,
  kickoffFitCount,
  kickoffGraduationTarget,
  kickoffJourneyStages,
  kickoffMoveSources,
  kickoffMoveSplit,
  kickoffNextStepText,
  kickoffUpcomingDetails,
  kickoffWorkflowConfirmed,
  kickoffWorkflowFields,
  nextWorkingSession,
  type KickoffMoveItem,
} from "@/lib/kickoff-view";
import { FUNCTIONAL_BY, TARGET_GRADUATION, functionalByDate } from "@/lib/date-labels";
import { shortDay } from "@/lib/onboarding-timeline";
import { cn } from "@/lib/utils";
import type { WelcomeView } from "@/lib/welcome";
import { HANDOFF_ROLES, partnerStage } from "@/lib/partner-implementation";
import { presentedSlideKeys, type KickoffSelection } from "@/lib/kickoff-slides";

/**
 * KICKOFF VIEW — the six customer-facing Kickoff slides, composed from the
 * same WelcomeView the living Plan already reads. One implementation, two
 * views: this file adds the second composition, never a second data model.
 *
 * THE STANDARD DECK: Welcome, How the work runs, Your journey, We build it
 * together, Before we meet again, plus two conditional slides: Your additional
 * solutions (after the journey, only when solutions were bought) and Your first
 * form (only when the TIS has confirmed it is ready). THE PARTNER DECK: six
 * slides of its own (P1 to P6), in the same family. Which deck a deal gets, and
 * which conditional slides it shows, is decided in kickoff-slides.ts.
 *
 * Every slide shows only what the Hub already holds. A missing answer is
 * labelled as something to confirm together, never filled in. Internal
 * instructions for the TIS live in the Presenter Workspace, not here.
 */

const longText = (text: string | null) =>
  text && text.length > KICKOFF_LONG_TEXT ? "is-long" : undefined;

/* ---------------------------------------------------------- 1. Welcome */

function KickoffCover({ view }: { view: WelcomeView }) {
  const outcome = kickoffBusinessOutcome(view);
  const outcomeConfirmed = kickoffBusinessOutcomeConfirmed(view);
  const graduation = kickoffGraduationTarget(view.journey);
  // The plan's Functional by date: the same day the customer's page and the
  // kickoff .pptx show. A partner's dates are the partner's, so none here.
  const functionalBy =
    view.path === "partner_implementation" ? null : functionalByDate(view.timeline);
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
          <p className="wp-eyebrow">Kickoff · Your team</p>
          <h1 className="wp-title is-hero">
            <T k="kickoff-cover.title">Let's bring</T>{" "}
            <span className="wp-accent">
              <T k="kickoff-cover.accent">your workflow</T>
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
              functionalBy ? `${FUNCTIONAL_BY} ${shortDay(functionalBy)}` : null,
              graduation ? `${TARGET_GRADUATION} ${shortDay(graduation)}` : null,
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
                {view.firstForm?.name ?? "Your workflow"}, on the phone
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

const WORKFLOW_COLUMNS = [
  { key: "before", title: "Before", icon: "FileText", tone: "light" },
  { key: "during", title: "During", icon: "Smartphone", tone: "blue" },
  { key: "after", title: "After", icon: "Cloud", tone: "navy" },
] as const;

function KickoffWorkflow({ view, page }: { view: WelcomeView; page: number }) {
  const fields = kickoffWorkflowFields(view.workflowStory);
  const confirmed = kickoffWorkflowConfirmed(view.workflowStory);
  return (
    <Frame
      k="kickoff-workflow"
      page={page}
      eyebrow="Your workflow"
      title="How the work runs,"
      accent="in your words"
      lede={
        confirmed
          ? "Confirmed with you. Each question below is answered from what you told us."
          : "What we understand so far. We check each part with you before we build."
      }
    >
      <div className="wp-kick-flow">
        {WORKFLOW_COLUMNS.map((column, index) => {
          const text = fields[column.key];
          return (
            <Fragment key={column.key}>
              {index > 0 ? <span className="wp-kick-arrow" aria-hidden="true" /> : null}
              <section className="wp-kick-col">
                <div className="wp-kick-col-head">
                  <Tile name={column.icon} size="lg" tone={column.tone} />
                  <div>
                    <h3>{column.title}</h3>
                    {text ? (
                      <span className={cn("wp-next-tag", confirmed ? "is-agreed" : "is-proposed")}>
                        {confirmed ? "Confirmed with you" : "Proposed · to confirm"}
                      </span>
                    ) : null}
                  </div>
                </div>
                <p className="wp-kick-question">{KICKOFF_WORKFLOW_QUESTIONS[column.key]}</p>
                <p className={cn("wp-kick-answer", !text && "is-open", longText(text))}>
                  {text ?? KICKOFF_TO_CONFIRM}
                </p>
              </section>
            </Fragment>
          );
        })}
      </div>
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

/**
 * The delivery block on the journey slides: the SOW's duration in its own unit and
 * its starting condition, the proposed completion, and what it depends on. Always
 * labelled as proposed, never agreed. With no date proposed, it says the date is to
 * confirm together. Short lines, so it sits clear of the rail and the cards.
 */
function DeliveryNote({ view }: { view: WelcomeView }) {
  const d = view.kickoffDeck?.delivery;
  if (!d) return null;
  const s = d.suggestion;
  const lines: string[] = [];
  if (s.basis === "sow" && s.duration) {
    lines.push(
      `Delivery: ${s.duration.text}, ${s.startCondition.toLowerCase()}, as the SOW states it.`,
    );
  } else if (s.basis === "expedited") {
    lines.push("Delivery: an expedited date in the SOW, subject to resource review.");
  } else if (s.basis === "tier") {
    lines.push("Delivery: complexity-tier target, in business days from the close.");
  }
  // Confirmed dates are only the Hub's agreed stage targets, and only on the standard journey.
  const confirmed =
    view.kickoffDeck?.selection?.deckType === "standard" &&
    Boolean(view.journey?.stages.some((st) => st.target?.currentDate));
  const confirmedPhrase = confirmed ? "the stage targets shown on the journey" : "none yet";
  const effective = d.effective;
  if (effective.from && effective.to) {
    const when =
      effective.from === effective.to
        ? shortDay(effective.from)
        : `${shortDay(effective.from)} to ${shortDay(effective.to)}`;
    const basis =
      effective.source === "tis"
        ? "Adjusted by the TIS, proposed"
        : effective.source === "expedited"
          ? "Expedited, proposed, subject to resource review"
          : effective.source === "sow"
            ? "Proposed from the SOW"
            : "Proposed from the tier, in business days";
    lines.push(`${basis}: ${when}. Not yet agreed. Confirmed: ${confirmedPhrase}.`);
  } else {
    lines.push(`Completion date: proposed, to confirm together. Confirmed: ${confirmedPhrase}.`);
  }
  if (s.dependencies.length) {
    lines.push("Depends on the customer's deliverables, as the SOW states.");
  }
  return (
    <div className="wp-kick-delivery">
      {lines.map((line) => (
        <p key={line}>{line}</p>
      ))}
    </div>
  );
}

function KickoffJourney({ view, page }: { view: WelcomeView; page: number }) {
  const j = view.journey;
  const stages = j ? kickoffJourneyStages(j) : [];
  const details = kickoffUpcomingDetails(view);
  return (
    <Frame
      k="kickoff-journey"
      page={page}
      eyebrow="Your path to launch"
      title="Your journey from"
      accent="kickoff to go-live"
      lede="Each stage has one job. Agreed targets sit on their stage."
    >
      {j ? (
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
      ) : null}
      <DeliveryNote view={view} />
      <div className="wp-kick-upcoming">
        {KICKOFF_UPCOMING.map((stage) => {
          const facts = details[stage.key] ?? [];
          return (
            <section key={stage.key} className="wp-kick-up-card">
              <h4>{stage.label}</h4>
              <p>{stage.text}</p>
              {facts.length ? (
                <ul>
                  {facts.map((fact) => (
                    <li key={fact}>{fact}</li>
                  ))}
                </ul>
              ) : null}
            </section>
          );
        })}
      </div>
    </Frame>
  );
}

/* ----------------------------------- 4. What we expect from each other */

/**
 * The same slide for every implementation. It takes no account data, so
 * every customer sees the identical words, layout and order.
 */
function KickoffExpectations({ page }: { page: number }) {
  return (
    <Frame
      k="kickoff-communication"
      page={page}
      eyebrow="What we expect from each other"
      title={KICKOFF_EXPECTATIONS.title}
      accent={KICKOFF_EXPECTATIONS.accent}
      lede={KICKOFF_EXPECTATIONS.lede}
    >
      <div className="wp-kick-expect">
        {KICKOFF_EXPECTATIONS.columns.map((column) => (
          <section className="wp-kick-expect-col" key={column.label}>
            <header>
              <Tile name={column.icon} size="sm" tone="blue" />
              <div>
                <h4>{column.label}</h4>
                <p>{column.role}</p>
              </div>
            </header>
            <ul>
              {column.items.map((item) => (
                <li key={item}>
                  <Check className="wp-kick-check" strokeWidth={3} aria-hidden="true" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <aside className="wp-kick-momentum">
        <h4>{KICKOFF_EXPECTATIONS.momentum.title}</h4>
        <p>{KICKOFF_EXPECTATIONS.momentum.text}</p>
      </aside>
    </Frame>
  );
}

/* ---------------------------------------------- 5. Let's work on Form V1 */

function KickoffFormV1({ view, page }: { view: WelcomeView; page: number }) {
  const changes = kickoffChanges(view.parkingLot);
  const shown = changes.slice(
    0,
    kickoffFitCount(changes, (c) => Math.ceil(c.request.length / 42) + 1, 8, 4),
  );
  const more = changes.length - shown.length;
  return (
    <Frame
      k="kickoff-form-v1"
      page={page}
      eyebrow="Let's work on Form V1"
      title={view.firstForm?.name ?? "Your first form"}
      accent=""
    >
      <div className="wp-kick-form">
        <div className="wp-kick-phone">
          <PhoneMock view={view} />
        </div>
        <ol className="wp-kick-steps">
          {KICKOFF_FORM_STEPS.map((step, index) => (
            <li key={step.label}>
              <span className="wp-step-no">{index + 1}</span>
              <div>
                <b>{step.label}</b>
                <p>{step.text}</p>
              </div>
            </li>
          ))}
        </ol>
        <section className="wp-kick-changes">
          <h4>Changes to make</h4>
          {shown.length ? (
            <ul>
              {shown.map((change, index) => (
                <li key={`${index}-${change.request}`}>
                  <span className="wp-kick-change-text">{change.request}</span>
                  <span className="wp-kick-change-meta">
                    <span
                      className={cn(
                        "wp-kick-chip",
                        change.status === "scheduled" && "is-scheduled",
                      )}
                    >
                      {change.status === "scheduled" ? "Scheduled" : "Open"}
                    </span>
                    {change.owner}
                    {change.target ? ` · ${change.target}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="wp-kick-empty">
              No changes recorded yet. We&apos;ll note them as we review the form together.
            </p>
          )}
          {more > 0 ? (
            <p className="wp-kick-more">+{more} more on your Implementation Plan</p>
          ) : null}
        </section>
      </div>
    </Frame>
  );
}

/* ----------------------------------------------- 6. Before we meet again */

function MoveColumn({
  title,
  side,
  icon,
  items,
  emptyText,
  tone,
}: {
  title: string;
  side: string;
  icon: string;
  items: KickoffMoveItem[];
  emptyText: string;
  tone: "navy" | "blue";
}) {
  const shown = items.slice(
    0,
    kickoffFitCount(items, (item) => Math.ceil(item.what.length / 58) + 1, 6, 3),
  );
  const more = items.length - shown.length;
  return (
    <section className={cn("wp-kick-move-col", `is-${tone}`)}>
      <header>
        <Tile name={icon} size="sm" tone={tone === "navy" ? "navy" : "blue"} />
        <div>
          <h3>{title}</h3>
          <span>{side}</span>
        </div>
      </header>
      {shown.length ? (
        <ul>
          {shown.map((item) => (
            <li key={item.id}>
              <b>{item.what}</b>
              <span className="wp-kick-move-meta">
                {[
                  item.person,
                  item.due ? `by ${shortDay(item.due)}` : null,
                  item.shared ? "shared" : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
                <span className={cn("wp-next-tag", item.confirmed ? "is-agreed" : "is-proposed")}>
                  {item.confirmed ? "Confirmed" : "Proposed"}
                </span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="wp-kick-empty">{emptyText}</p>
      )}
      {more > 0 ? <p className="wp-kick-more">+{more} more on your Implementation Plan</p> : null}
    </section>
  );
}

/** The next-move body: the action columns, the notes, the next session and the real-world test. */
function NextMoveBody({ view }: { view: WelcomeView }) {
  const session = nextWorkingSession(view.timeline.milestones);
  const cutoff = session?.booked ? session.date : null;
  const sources = kickoffMoveSources(view);
  const split = kickoffMoveSplit(sources, cutoff);
  const nothingRecorded = sources.ours.length === 0 && sources.theirs.length === 0;
  const windowEmpty = cutoff
    ? "Nothing due before the next session."
    : "No dated actions recorded yet.";
  const nextText = kickoffNextStepText(view.firstForm?.name ?? null);
  const timezone = view.timeline.timezone ? ` ${view.timeline.timezone}` : "";

  return (
    <>
      <div className="wp-kick-move">
        <MoveColumn
          title="For us to do"
          side="GoCanvas"
          icon="Wrench"
          tone="navy"
          items={split.ours}
          emptyText={nothingRecorded ? "Nothing recorded yet." : windowEmpty}
        />
        <MoveColumn
          title="For you to do"
          side="Your team"
          icon="HardHat"
          tone="blue"
          items={split.theirs}
          emptyText={nothingRecorded ? "Nothing recorded yet." : windowEmpty}
        />
      </div>
      {nothingRecorded ? (
        <p className="wp-kick-note is-strong">
          Responsibilities need to be agreed before kickoff ends.
        </p>
      ) : null}
      {split.undated > 0 ? (
        <p className="wp-kick-note">
          {split.undated} more recorded without a date. They are in your Implementation Plan.
        </p>
      ) : null}
      <div className="wp-kick-session">
        <div>
          <span className="wp-kick-session-label">Next working session</span>
          {session?.booked && session.time ? (
            <span className="wp-kick-session-value">
              {session.label} · {shortDay(session.date)} at {session.time}
              {timezone}
            </span>
          ) : (
            <span className="wp-kick-session-value is-open">To be scheduled</span>
          )}
        </div>
        <p>Full action list: your Implementation Plan.</p>
      </div>
      <div className="wp-kick-cta">
        <span className="wp-kick-cta-label">Real-world test</span>
        <span className="wp-kick-cta-text">{nextText}</span>
      </div>
    </>
  );
}

function KickoffNextMove({ view, page }: { view: WelcomeView; page: number }) {
  return (
    <Frame
      k="kickoff-next"
      page={page}
      eyebrow="Your next move"
      title={KICKOFF_NEXT_HEADLINE.title}
      accent={KICKOFF_NEXT_HEADLINE.accent}
      lede={KICKOFF_NEXT_LEDE}
    >
      <NextMoveBody view={view} />
    </Frame>
  );
}

/** The Kickoff composition: six fixed screens, always, in this order.
 * Never filtered by the customer's persisted hidden-screen preferences —
 * those belong to the Plan composition only. See WelcomePage's `experience`
 * state. */
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
      label: "What we expect from each other",
      render: (a) => <KickoffExpectations key="kickoff-communication" page={a.page} />,
    },
    {
      key: "kickoff-form-v1",
      label: "Let's work on Form V1",
      render: (a) => <KickoffFormV1 key="kickoff-form-v1" view={view} page={a.page} />,
    },
    {
      key: "kickoff-next",
      label: "Before we meet again",
      render: (a) => <KickoffNextMove key="kickoff-next" view={view} page={a.page} />,
    },
  ];
}

/* ------------------------------------- Slide A: Your additional solutions */

/**
 * Your additional solutions: the purchased solutions beyond training and the
 * first form. Name and phase come from the plan. What each one delivers is not
 * recorded on the plan yet, so it is shown as to confirm together, not invented.
 */
function KickoffAdditional({ view, page }: { view: WelcomeView; page: number }) {
  const items = view.kickoffDeck?.additional ?? [];
  return (
    <Frame
      k="kickoff-additional"
      page={page}
      eyebrow="Your additional solutions"
      title="Your additional"
      accent="solutions."
    >
      {items.length ? (
        <div className="wp-kick-achieve wp-kick-additional">
          {items.map((s) => (
            <section key={`${s.kind}-${s.name}`}>
              <h4>{s.name}</h4>
              <p>
                Phase {s.phase} · What it delivers: {KICKOFF_TO_CONFIRM}
              </p>
            </section>
          ))}
        </div>
      ) : (
        <p className="wp-kick-additional">{KICKOFF_TO_CONFIRM}</p>
      )}
    </Frame>
  );
}

/* ------------------------------------------------ Partner deck: P1 to P6 */

const PARTNER_JOURNEY_KEYS = ["form_finalisation", "pilot", "trial_run", "roll_out"] as const;

/** P1: Let's get your implementation moving. The standard cover's composition, with the partner's lead. */
function PartnerWelcome({ view }: { view: WelcomeView; page: number }) {
  const partner = view.kickoffDeck?.partnerName ?? null;
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
          <p className="wp-eyebrow">Kickoff · Partner implementation</p>
          <h1 className="wp-title is-hero">
            <T k="partner-welcome.title">Let's get your</T>{" "}
            <span className="wp-accent">
              <T k="partner-welcome.accent">implementation</T>
            </span>{" "}
            <T k="partner-welcome.end">moving.</T>
          </h1>
          <div className="wp-rule" />
          <p className="wp-cover-name">
            <T k="partner-welcome.name">{view.clientName}</T>
          </p>
          <p className="wp-lede">
            {partner ? `Led by ${partner}, with GoCanvas alongside.` : KICKOFF_TO_CONFIRM}
          </p>
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
        <div className="wp-cover-art">
          <div className="wp-photo wp-phone-panel">
            <PhoneMock view={view} />
            <span className="wp-photo-cap">
              <Icon name="Smartphone" className="h-3.5 w-3.5" />
              {view.firstForm?.name ?? "Your workflow"}, on the phone
            </span>
          </div>
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

/** P2: Here's where we're starting. The goal, and what is already in place as recorded. */
function PartnerStart({ view, page }: { view: WelcomeView; page: number }) {
  const outcome = kickoffBusinessOutcome(view);
  const partner = view.kickoffDeck?.partnerName ?? null;
  const additional = view.kickoffDeck?.additional ?? [];
  return (
    <Frame
      k="partner-start"
      page={page}
      eyebrow="Where we're starting"
      title="Here's where"
      accent="we're starting."
    >
      <div className="wp-kick-achieve">
        <section>
          <h4>Your goal</h4>
          <p className="wp-lede">{outcome ?? KICKOFF_TO_CONFIRM}</p>
        </section>
        <section>
          <h4>What's already in place</h4>
          <ul>
            <li>Led by {partner ?? KICKOFF_TO_CONFIRM}</li>
            <li>
              {view.firstForm?.name
                ? `First form: ${view.firstForm.name}`
                : `First form: ${KICKOFF_TO_CONFIRM}`}
            </li>
            {additional.map((s) => (
              <li key={`${s.kind}-${s.name}`}>
                {s.name} · Phase {s.phase}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </Frame>
  );
}

/** P3: From kickoff to rollout, here's our plan. Four stages, no dates unless they are recorded. */
function PartnerJourney({ view, page }: { view: WelcomeView; page: number }) {
  return (
    <Frame
      k="partner-journey"
      page={page}
      eyebrow="Your path to rollout"
      title="From kickoff to rollout,"
      accent="here's our plan."
    >
      <ol className="wp-kick-steps">
        {PARTNER_JOURNEY_KEYS.map((key, index) => (
          <li key={key}>
            <span className="wp-step-no">{index + 1}</span>
            <div>
              <b>{partnerStage(key).label}</b>
              <p>{partnerStage(key).description}</p>
            </div>
          </li>
        ))}
      </ol>
      <DeliveryNote view={view} />
    </Frame>
  );
}

/** P4: Three teams. One shared outcome. Each team's part, as the plan records it. */
function PartnerTogether({ view, page }: { view: WelcomeView; page: number }) {
  const partner = view.kickoffDeck?.partnerName ?? null;
  const [gocanvasOwns, partnerRemains] = HANDOFF_ROLES.after.split("; ");
  const session = nextWorkingSession(view.timeline.milestones);
  const people = [view.team.lead, view.team.champion?.name ?? null].filter((name): name is string =>
    Boolean(name),
  );
  return (
    <Frame
      k="partner-together"
      page={page}
      eyebrow="How we work together"
      title="Three teams."
      accent="One shared outcome."
    >
      <div className="wp-kick-achieve">
        <section>
          <h4>GoCanvas Implementation</h4>
          <ul>
            {gocanvasOwns ? <li>{gocanvasOwns}.</li> : null}
            {PARTNER_JOURNEY_KEYS.map((key) => (
              <li key={key}>{partnerStage(key).description}</li>
            ))}
          </ul>
        </section>
        <section>
          <h4>Your Partner Technical Team</h4>
          <ul>
            <li>{partner ?? KICKOFF_TO_CONFIRM}</li>
            <li>{HANDOFF_ROLES.before}</li>
            {partnerRemains ? (
              <li>The partner {partnerRemains.replace(/^the partner /, "")}</li>
            ) : null}
          </ul>
        </section>
        <section>
          <h4>Your Team</h4>
          {people.length ? (
            <ul>
              {people.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
          ) : (
            <p>{KICKOFF_TO_CONFIRM}</p>
          )}
        </section>
        <section>
          <h4>How we'll stay aligned</h4>
          <p>
            {session?.booked && session.time
              ? `Next working session: ${session.label} · ${shortDay(session.date)} at ${session.time}`
              : "Next working session: To be scheduled."}
          </p>
        </section>
      </div>
    </Frame>
  );
}

/** P5: What do we need to prove works? Workflow, information, people, result. */
function PartnerProof({ view, page }: { view: WelcomeView; page: number }) {
  const outcome = kickoffBusinessOutcome(view);
  const people = [view.team.lead, view.team.champion?.name ?? null].filter((name): name is string =>
    Boolean(name),
  );
  return (
    <Frame
      k="partner-proof"
      page={page}
      eyebrow="What we need to prove"
      title="What do we need to"
      accent="prove works?"
    >
      <div className="wp-kick-achieve">
        <section>
          <h4>Workflow</h4>
          <p>{view.firstForm?.name ?? KICKOFF_TO_CONFIRM}</p>
        </section>
        <section>
          <h4>Information</h4>
          <p>{KICKOFF_TO_CONFIRM}</p>
        </section>
        <section>
          <h4>People</h4>
          {people.length ? <p>{people.join(", ")}</p> : <p>{KICKOFF_TO_CONFIRM}</p>}
        </section>
        <section>
          <h4>Result</h4>
          <p>{outcome ?? KICKOFF_TO_CONFIRM}</p>
        </section>
      </div>
    </Frame>
  );
}

/** P6: Here's what happens next. The same action table as the standard closing slide. */
function PartnerNext({ view, page }: { view: WelcomeView; page: number }) {
  return (
    <Frame
      k="partner-next"
      page={page}
      eyebrow="Your next move"
      title="Here's what"
      accent="happens next."
      lede={KICKOFF_NEXT_LEDE}
    >
      <NextMoveBody view={view} />
    </Frame>
  );
}

/** Every Kickoff screen the library can show, keyed as the presentation keys them. */
export function kickoffLibrary(view: WelcomeView): Record<string, Screen> {
  const six = Object.fromEntries(kickoffScreenList(view).map((sc) => [sc.key, sc]));
  return {
    ...six,
    "kickoff-additional": {
      key: "kickoff-additional",
      label: "Your additional solutions",
      render: (a) => <KickoffAdditional key="kickoff-additional" view={view} page={a.page} />,
    },
    "partner-welcome": {
      key: "partner-welcome",
      label: "Let's get your implementation moving.",
      render: (a) => <PartnerWelcome key="partner-welcome" view={view} page={a.page} />,
    },
    "partner-start": {
      key: "partner-start",
      label: "Here's where we're starting.",
      render: (a) => <PartnerStart key="partner-start" view={view} page={a.page} />,
    },
    "partner-journey": {
      key: "partner-journey",
      label: "From kickoff to rollout, here's our plan.",
      render: (a) => <PartnerJourney key="partner-journey" view={view} page={a.page} />,
    },
    "partner-together": {
      key: "partner-together",
      label: "Three teams. One shared outcome.",
      render: (a) => <PartnerTogether key="partner-together" view={view} page={a.page} />,
    },
    "partner-proof": {
      key: "partner-proof",
      label: "What do we need to prove works?",
      render: (a) => <PartnerProof key="partner-proof" view={view} page={a.page} />,
    },
    "partner-next": {
      key: "partner-next",
      label: "Here's what happens next.",
      render: (a) => <PartnerNext key="partner-next" view={view} page={a.page} />,
    },
  } as Record<string, Screen>;
}

/**
 * The screens the Kickoff presentation shows, in presentation order. An internal
 * view with a deck shows exactly its selection. A deck that did not load, or whose
 * deck type is unsettled, shows nothing: the presentation is blocked
 * (kickoffDeckBlocked). With no deck at all (not an internal view), the standard
 * deck shows its core slides only: nothing confirmed, so no conditional slide.
 */
export function kickoffScreensFor(view: WelcomeView): Screen[] {
  const deck = view.kickoffDeck;
  if (deck?.loadError) return [];
  const selection = deck ? deck.selection : UNCONFIRMED_STANDARD;
  const library = kickoffLibrary(view);
  return presentedSlideKeys(selection)
    .map((key) => library[key])
    .filter((screen): screen is Screen => Boolean(screen));
}

const UNCONFIRMED_STANDARD: KickoffSelection = {
  deckType: "standard",
  formReady: false,
  hasAdditional: false,
};
