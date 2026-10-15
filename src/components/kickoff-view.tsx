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

/**
 * KICKOFF VIEW — the six customer-facing Kickoff slides, composed from the
 * same WelcomeView the living Plan already reads. One implementation, two
 * views: this file adds the second composition, never a second data model.
 *
 * SIX FIXED SCREENS, always, for every account, in this order: Welcome, Your
 * workflow, Your implementation journey, What we expect from each other,
 * Let's work on Form V1, Before we meet again. Complexity changes the content
 * within a screen, never the number of screens.
 *
 * Every slide shows only what the Hub already holds. A missing answer is
 * labelled as something to confirm together, never filled in. Internal
 * instructions for the TIS live in the Presenter Workspace, not here.
 */

const longText = (text: string | null) =>
  text && text.length > KICKOFF_LONG_TEXT ? "is-long" : undefined;

/* ---------------------------------------------------------- 1. Welcome */

function KickoffCover({ view }: { view: WelcomeView }) {
  const workflowName = view.firstForm?.name ?? "your workflow";
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
          <p className="wp-eyebrow">Kickoff · {view.industry ?? "Your team"}</p>
          <h1 className="wp-title is-hero">
            <T k="kickoff-cover.title">Let's bring</T>{" "}
            <span className={cn("wp-accent", workflowName.length > 24 && "is-long")}>
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
      lede="Each stage has one job. The dates are the targets we have agreed."
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

function KickoffNextMove({ view, page }: { view: WelcomeView; page: number }) {
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
    <Frame
      k="kickoff-next"
      page={page}
      eyebrow="Your next move"
      title={KICKOFF_NEXT_HEADLINE.title}
      accent={KICKOFF_NEXT_HEADLINE.accent}
      lede={KICKOFF_NEXT_LEDE}
    >
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
