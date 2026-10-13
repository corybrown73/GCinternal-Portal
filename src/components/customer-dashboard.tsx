import { useState, type CSSProperties, type ReactNode } from "react";
import { Check, CalendarPlus, Circle, CircleDot, ExternalLink, Mail } from "lucide-react";

import { T, tkey, type WelcomeMode } from "@/components/welcome-primitives";
import { KICKOFF_EXPECTATIONS } from "@/lib/kickoff-view";
import {
  attentionItems,
  blockerItems,
  dashboardHeader,
  dashboardResources,
  GOCANVAS_WORK_STATE_LABEL,
  gocanvasWork,
  homeworkTexts,
  ideasForLater,
  nextBookedSession,
  tisContact,
  type AttentionItem,
  type BlockerItem,
} from "@/lib/customer-dashboard";
import { CUSTOMER_SOLUTION_STATUS } from "@/lib/welcome-journey";
import type { HandoffValue } from "@/lib/sales-handoff";
import { shortDay } from "@/lib/onboarding-timeline";
import type { HomeworkKey, WelcomeView } from "@/lib/welcome";
import { cn } from "@/lib/utils";

/**
 * The customer's living implementation dashboard. ONE rendering for the
 * customer's link and the internal preview: the preview passes no write
 * handlers, so every control on it is shown and cannot act. The page reads only
 * the customer's copy of the view (see customerWelcomeView), and every value it
 * shows is recorded, or says plainly that it is not yet.
 *
 * LAYOUT. A full-width header (who, where they are, how far, when it lands),
 * then a 60/40 body on a wide screen: what needs them and what is holding things
 * up on the left, the next session, GoCanvas's work, the TIS and resources on the
 * right. Below 1024px the body becomes one column, ordered so the most useful
 * cards come first (see the `o-*` order rules in styles.css).
 */
export function CustomerDashboard({
  view,
  today,
  mode,
  onTick,
  onAnswer,
  onBall,
  icsBase,
}: {
  view: WelcomeView;
  /** The local day as YYYY-MM-DD, once known. Used to pick what is still ahead. */
  today: string | null;
  mode: WelcomeMode;
  onTick?: ((key: HomeworkKey, done: boolean) => Promise<void> | void) | undefined;
  onAnswer?: ((key: string, value: HandoffValue) => Promise<void> | void) | undefined;
  onBall?: ((solutionId: string) => Promise<void> | void) | undefined;
  icsBase: string | null;
}) {
  const interactive = mode === "shared";
  const header = dashboardHeader(view, today);
  const questionsOpen = view.intake ? view.intake.needed.length > 0 : false;
  return (
    <main className="gc-dash" aria-labelledby="gc-dash-title">
      {mode === "internal" ? (
        <p className="gc-dash-preview" role="note">
          Internal preview of the customer&apos;s dashboard. The customer&apos;s own controls are
          shown here but do nothing.
        </p>
      ) : null}

      <DashHeader view={view} header={header} />

      <div className="gc-dash-body">
        <div className="gc-dash-main">
          <Card id="attention" title="What needs your attention" order="attention" tone="action">
            <Attention view={view} interactive={interactive} onTick={onTick} onBall={onBall} />
          </Card>

          {view.intake ? (
            <Card
              id="answers"
              title="Your answers before kickoff"
              order="answers"
              tone={questionsOpen ? "action" : "info"}
            >
              {questionsOpen ? (
                <BeforeKickoff view={view} interactive={interactive} onAnswer={onAnswer} />
              ) : (
                <Disclosure label="All answered · show your answers">
                  <BeforeKickoff view={view} interactive={interactive} onAnswer={onAnswer} />
                </Disclosure>
              )}
            </Card>
          ) : null}

          <Card id="progress" title="Progress and blockers" order="progress">
            <Blockers view={view} />
          </Card>

          <Card id="agreements" title="Our kickoff agreements" order="agreements" wide>
            <Agreements view={view} />
          </Card>
        </div>

        <aside className="gc-dash-side">
          <Card id="session" title="Next working session" order="session">
            <NextSession view={view} today={today} icsBase={icsBase} />
          </Card>

          <Card id="contact" title="Contact your TIS" order="contact">
            <Contact view={view} />
          </Card>

          <Card id="gocanvas" title="What GoCanvas is working on" order="gocanvas">
            <GocanvasWork view={view} />
          </Card>

          <Card id="resources" title="Resources" order="resources">
            <Resources view={view} />
          </Card>
        </aside>
      </div>

      <footer className="gc-dash-foot">
        <span>gocanvas.com</span>
      </footer>
    </main>
  );
}

/** One titled card. `tone="action"` marks what the customer must act on; the rest is reference. */
function Card({
  id,
  title,
  order,
  tone = "info",
  wide,
  children,
}: {
  id: string;
  title: string;
  order: string;
  tone?: "action" | "info";
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "gc-dash-card",
        `o-${order}`,
        tone === "action" && "is-action",
        wide && "is-wide",
      )}
      aria-labelledby={`gc-${id}-title`}
    >
      <h2 id={`gc-${id}-title`} className="gc-dash-h2">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** A collapsed-by-default section, with a label that says what it holds. */
function Disclosure({
  label,
  children,
  defaultOpen = false,
}: {
  label: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details className="gc-dash-disclosure" open={defaultOpen || undefined}>
      <summary>{label}</summary>
      <div className="gc-dash-disclosure-body">{children}</div>
    </details>
  );
}

/* ----------------------------------------------------------------- header */

function DashHeader({
  view,
  header,
}: {
  view: WelcomeView;
  header: ReturnType<typeof dashboardHeader>;
}) {
  return (
    <header className="gc-dash-head">
      <div className="gc-dash-head-top">
        <div className="gc-dash-title-block">
          <p className="gc-dash-eyebrow">Your implementation</p>
          <h1 id="gc-dash-title" className="gc-dash-title">
            {view.clientName}
          </h1>
          {header.started ? (
            <p className="gc-dash-stage">
              Current stage <strong>{header.currentLabel}</strong>
            </p>
          ) : (
            <p className="gc-dash-stage">Your implementation starts once your account is set up.</p>
          )}
        </div>
        <div className="gc-dash-brand">
          <img src="/branding/gocanvas-wordmark-navy.png" alt="GoCanvas" className="gc-dash-logo" />
          {view.clientLogoUrl ? (
            <img src={view.clientLogoUrl} alt={view.clientName} className="gc-dash-client-logo" />
          ) : null}
        </div>
      </div>

      {header.started ? (
        <ol
          className="gc-dash-bar"
          aria-label="Implementation progress"
          style={{ "--gc-dash-cols": header.stages.length } as CSSProperties}
        >
          {header.stages.map((s) => (
            <li
              key={s.key}
              className={cn("gc-dash-seg", `is-${s.state}`)}
              aria-current={s.state === "now" ? "step" : undefined}
            >
              <span className="gc-dash-seg-fill" aria-hidden="true" />
              <span className="gc-dash-seg-label">{s.label}</span>
              <span className="gc-dash-seg-state">
                <StageIcon state={s.state} />
                {s.state === "done" ? "Done" : s.state === "now" ? "Now" : "Upcoming"}
              </span>
            </li>
          ))}
        </ol>
      ) : null}

      <div className="gc-dash-facts">
        <div className="gc-dash-fact">
          <span className="gc-dash-fact-label">Target graduation</span>
          <span className="gc-dash-fact-value">
            {header.graduation.current ? (
              <>
                {shortDay(header.graduation.current)}
                {header.graduation.moved && header.graduation.original ? (
                  <span className="gc-dash-muted">
                    {" "}
                    · first agreed {shortDay(header.graduation.original)}
                  </span>
                ) : null}
              </>
            ) : (
              <span className="gc-dash-muted">Target date to be confirmed.</span>
            )}
          </span>
        </div>
        <div className="gc-dash-fact">
          <span className="gc-dash-fact-label">Next milestone</span>
          <span className="gc-dash-fact-value">
            {header.nextMilestone ? (
              <>
                {header.nextMilestone.label}
                <span className="gc-dash-muted">
                  {" · "}
                  {header.nextMilestone.status === "to_schedule"
                    ? "to be scheduled"
                    : header.nextMilestone.date
                      ? `${header.nextMilestone.status === "booked" ? "" : "planned "}${shortDay(header.nextMilestone.date)}`
                      : ""}
                </span>
              </>
            ) : (
              <span className="gc-dash-muted">Next milestone to be confirmed.</span>
            )}
          </span>
        </div>
      </div>

      {header.started ? <FullJourney view={view} header={header} /> : null}
    </header>
  );
}

function StageIcon({ state }: { state: "done" | "now" | "later" }) {
  if (state === "done")
    return <Check className="gc-dash-icon" strokeWidth={3} aria-hidden="true" />;
  if (state === "now") return <CircleDot className="gc-dash-icon" aria-hidden="true" />;
  return <Circle className="gc-dash-icon" aria-hidden="true" />;
}

function FullJourney({
  view,
  header,
}: {
  view: WelcomeView;
  header: ReturnType<typeof dashboardHeader>;
}) {
  const stages = view.journey?.stages ?? [];
  const delivered = (view.journey?.solutions ?? []).filter(
    (s) => s.who === "done" && s.status === CUSTOMER_SOLUTION_STATUS.accepted,
  );
  return (
    <details className="gc-dash-journey">
      <summary>View full journey</summary>
      <ol className="gc-dash-stages">
        {stages.map((s) => {
          const state = header.stages.find((h) => h.key === s.key)?.state ?? "later";
          return (
            <li key={s.key} className={cn("gc-dash-stage-row", `is-${state}`)}>
              <div className="gc-dash-stage-head">
                <StageIcon state={state} />
                <span className="gc-dash-stage-name">{s.label}</span>
                <span className="gc-dash-stage-state">
                  {state === "done" ? "Completed" : state === "now" ? "Current" : "Upcoming"}
                </span>
              </div>
              <p className="gc-dash-stage-dates">
                {s.target ? (
                  <>
                    <span>
                      {s.target.currentDate
                        ? `Target ${shortDay(s.target.currentDate)}`
                        : "Target to be confirmed"}
                    </span>
                    {s.target.originalDate &&
                    s.target.currentDate &&
                    s.target.originalDate !== s.target.currentDate ? (
                      <span className="gc-dash-muted">
                        {" "}
                        · first agreed {shortDay(s.target.originalDate)}
                      </span>
                    ) : null}
                    {s.target.actualDate ? (
                      <span> · completed {shortDay(s.target.actualDate)}</span>
                    ) : null}
                  </>
                ) : (
                  <span className="gc-dash-muted">No target date for this stage</span>
                )}
              </p>
              <p className="gc-dash-stage-blurb">{s.blurb}</p>
            </li>
          );
        })}
      </ol>
      {delivered.length ? (
        <div className="gc-dash-delivered">
          <h3>Delivered so far</h3>
          <ul>
            {delivered.map((s) => (
              <li key={s.id}>{s.name}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </details>
  );
}

/* --------------------------------------------------- what needs your attention */

function Attention({
  view,
  interactive,
  onTick,
  onBall,
}: {
  view: WelcomeView;
  interactive: boolean;
  onTick?: ((key: HomeworkKey, done: boolean) => Promise<void> | void) | undefined;
  onBall?: ((solutionId: string) => Promise<void> | void) | undefined;
}) {
  const items = attentionItems(view);
  const actions = items.filter((i) => i.kind !== "homework");
  const homework = items.filter((i) => i.kind === "homework");
  const waiting = actions.length > 0 || homework.some((h) => !h.done);
  return (
    <div className="gc-dash-attention">
      {!waiting ? <p className="gc-dash-empty">Nothing is waiting on you right now.</p> : null}
      {actions.length ? (
        <ul className="gc-dash-list">
          {actions.map((item) => (
            <AttentionRow key={item.id} item={item} interactive={interactive} onBall={onBall} />
          ))}
        </ul>
      ) : null}
      {homework.length ? (
        <div className="gc-dash-prep">
          <h3 className="gc-dash-h4">Preparation for the next working session</h3>
          <ul className="gc-dash-list is-compact">
            {homework.map((h) => {
              const key = h.homeworkKey!;
              const done = h.done;
              const id = `gc-hw-${key}`;
              return (
                <li key={h.id} className="gc-dash-row is-compact">
                  <label className="gc-dash-check" htmlFor={id}>
                    <input
                      id={id}
                      type="checkbox"
                      checked={done}
                      disabled={!interactive || !onTick}
                      onChange={() => {
                        if (onTick) void onTick(key, !done);
                      }}
                    />
                    <span>
                      <T k={tkey("together", "homework", key)}>{homeworkTexts(view)[key]}</T>
                    </span>
                  </label>
                  {h.coveredBy === "testing" ? (
                    <span className="gc-dash-muted">Covered by the testing action above</span>
                  ) : h.due ? (
                    <span className="gc-dash-muted">Plan date {shortDay(h.due)}</span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function AttentionRow({
  item,
  interactive,
  onBall,
}: {
  item: AttentionItem;
  interactive: boolean;
  onBall?: ((solutionId: string) => Promise<void> | void) | undefined;
}) {
  const [busy, setBusy] = useState(false);
  const dueLine = item.due
    ? `Due ${shortDay(item.due)}`
    : item.dueText
      ? `Target: ${item.dueText}`
      : "No date recorded";
  return (
    <li className="gc-dash-row">
      <div className="gc-dash-row-main">
        <span className="gc-dash-row-what">
          {item.what}
          {item.toConfirm ? <span className="gc-dash-tag">To confirm</span> : null}
        </span>
        <span className="gc-dash-muted">
          {item.owner ? `${item.owner} · ` : ""}
          {dueLine}
        </span>
      </div>
      {item.kind === "solution" && item.canConfirm && item.solutionId ? (
        <button
          type="button"
          className="gc-dash-button"
          disabled={!interactive || !onBall || busy}
          onClick={async () => {
            if (!onBall) return;
            setBusy(true);
            try {
              await onBall(item.solutionId!);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Saving…" : "Tested — it works"}
        </button>
      ) : null}
    </li>
  );
}

/* ------------------------------------------------------- progress and blockers */

function Blockers({ view }: { view: WelcomeView }) {
  const blockers: BlockerItem[] = blockerItems(view);
  if (!blockers.length) {
    return <p className="gc-dash-empty">No blockers recorded. Nothing is holding the work up.</p>;
  }
  return (
    <ul className="gc-dash-list">
      {blockers.map((b) => (
        <li key={b.id} className="gc-dash-row">
          <div className="gc-dash-row-main">
            <span className="gc-dash-row-what">
              {b.what}
              <span className="gc-dash-tag is-proposed">Waiting on you</span>
            </span>
            <span className="gc-dash-muted">
              {b.status}
              {b.owner ? ` · ${b.owner}` : ""}
              {b.due ? ` · wanted by ${shortDay(b.due)}` : b.dueText ? ` · ${b.dueText}` : ""}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ----------------------------------------------- before kickoff: the questions */

function BeforeKickoff({
  view,
  interactive,
  onAnswer,
}: {
  view: WelcomeView;
  interactive: boolean;
  onAnswer?: ((key: string, value: HandoffValue) => Promise<void> | void) | undefined;
}) {
  const intake = view.intake!;
  const [busy, setBusy] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const send = async (key: string, value: HandoffValue) => {
    if (!onAnswer) return;
    setBusy(key);
    try {
      await onAnswer(key, value);
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="gc-dash-answers">
      {intake.known.length ? (
        <ul className="gc-dash-list">
          {intake.known.map((k) => (
            <li key={k.key} className="gc-dash-row">
              <div className="gc-dash-row-main">
                <span className="gc-dash-row-what">{k.ask}</span>
                <span>{asText(k.value)}</span>
              </div>
              {k.confirmed ? (
                <span className="gc-dash-muted">Confirmed</span>
              ) : interactive && onAnswer ? (
                <button
                  type="button"
                  className="gc-dash-button"
                  disabled={busy === k.key}
                  onClick={() => void send(k.key, k.value)}
                >
                  That&apos;s right
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {intake.needed.length ? (
        <ul className="gc-dash-list">
          {intake.needed.map((q) => {
            const draft = drafts[q.key] ?? "";
            const disabled = !interactive || !onAnswer || busy === q.key;
            return (
              <li key={q.key} className="gc-dash-row is-stacked">
                <span className="gc-dash-row-what">{q.ask}</span>
                <span className="gc-dash-muted">{q.hint}</span>
                <div className="gc-dash-answer-row">
                  {q.kind === "long" || q.kind === "list" ? (
                    <textarea
                      rows={2}
                      value={draft}
                      disabled={disabled}
                      aria-label={q.ask}
                      onChange={(e) => setDrafts((d) => ({ ...d, [q.key]: e.target.value }))}
                    />
                  ) : (
                    <input
                      type={q.kind === "date" ? "date" : "text"}
                      value={draft}
                      disabled={disabled}
                      aria-label={q.ask}
                      onChange={(e) => setDrafts((d) => ({ ...d, [q.key]: e.target.value }))}
                    />
                  )}
                  <button
                    type="button"
                    className="gc-dash-button"
                    disabled={disabled || !draft.trim()}
                    onClick={() =>
                      void send(
                        q.key,
                        q.kind === "list"
                          ? draft
                              .split(/\n|,/)
                              .map((x) => x.trim())
                              .filter(Boolean)
                          : draft.trim(),
                      )
                    }
                  >
                    {busy === q.key ? "Saving…" : "Send"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="gc-dash-empty">Everything we asked for is in. Thank you.</p>
      )}
    </div>
  );
}

/** A recorded ISO date as a short day, or a recorded phrase as written. */
function dateOrText(value: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? shortDay(value) : value;
}

function asText(v: HandoffValue): string {
  if (v === null) return "";
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return v;
}

/* ---------------------------------------------------------- agreements */

function Agreements({ view }: { view: WelcomeView }) {
  const scope = view.customerScope;
  const ideas = ideasForLater(view.parkingLot);
  return (
    <div className="gc-dash-agreements">
      <div className="gc-dash-block">
        <h3 className="gc-dash-h4">Agreed deliverables</h3>
        {scope.state === "empty" ? (
          <p className="gc-dash-empty">
            Nothing recorded yet. We agree the first deliverables together.
          </p>
        ) : (
          <>
            <span
              className={cn("gc-dash-tag", scope.state === "agreed" ? "is-agreed" : "is-proposed")}
            >
              {scope.state === "agreed" ? "Agreed" : "Proposed · to confirm together"}
            </span>
            <ul className="gc-dash-bullets">
              {scope.items.map((text, index) => (
                <li key={`${index}-${text}`}>{text}</li>
              ))}
            </ul>
          </>
        )}
      </div>

      <Disclosure label="How we'll work together">
        <div className="gc-dash-expect">
          {KICKOFF_EXPECTATIONS.columns.map((column) => (
            <section key={column.label} className="gc-dash-expect-col">
              <h4>
                {column.label} <span className="gc-dash-muted">· {column.role}</span>
              </h4>
              <ul>
                {column.items.map((item) => (
                  <li key={item}>
                    <Check className="gc-dash-icon" strokeWidth={3} aria-hidden="true" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </Disclosure>

      <Disclosure label={`Ideas and requests for later (${ideas.length})`}>
        {ideas.length ? (
          <ul className="gc-dash-list is-compact">
            {ideas.map((idea) => (
              <li key={idea.id} className="gc-dash-row is-compact">
                <div className="gc-dash-row-main">
                  <span className="gc-dash-row-what">{idea.what}</span>
                  <span className="gc-dash-muted">
                    {idea.category === "needed_for_launch"
                      ? "Needed for launch"
                      : "Other request · we will review it together"}
                    {idea.target ? ` · ${dateOrText(idea.target)}` : ""}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="gc-dash-empty">No requests recorded right now.</p>
        )}
      </Disclosure>
    </div>
  );
}

/* ------------------------------------------------------ next working session */

function NextSession({
  view,
  today,
  icsBase,
}: {
  view: WelcomeView;
  today: string | null;
  icsBase: string | null;
}) {
  if (today === null) {
    return <p className="gc-dash-empty">Checking your next session…</p>;
  }
  const session = nextBookedSession(view.timeline.milestones, today);
  if (!session) {
    return <p className="gc-dash-empty">Next working session to be scheduled.</p>;
  }
  return (
    <article className="gc-dash-session">
      <p className="gc-dash-session-label">{session.label}</p>
      <p className="gc-dash-session-when">
        {shortDay(session.date)} at {session.time}
        {view.timeline.timezone ? ` ${view.timeline.timezone}` : ""}
      </p>
      {session.purpose ? <p className="gc-dash-session-purpose">{session.purpose}</p> : null}
      {session.prepare.length ? (
        <div>
          <h4 className="gc-dash-h4">To prepare</h4>
          <ul className="gc-dash-bullets">
            {session.prepare.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {icsBase ? (
        <a href={icsBase} className="gc-dash-link">
          <CalendarPlus className="gc-dash-icon" aria-hidden="true" /> Add all dates to your
          calendar
        </a>
      ) : null}
    </article>
  );
}

/* ----------------------------------------------- what GoCanvas is working on */

function GocanvasWork({ view }: { view: WelcomeView }) {
  const items = gocanvasWork(view);
  if (!items.length) {
    return <p className="gc-dash-empty">No GoCanvas work status is recorded yet.</p>;
  }
  return (
    <ul className="gc-dash-list is-compact">
      {items.map((item) => (
        <li key={item.id} className="gc-dash-row is-compact">
          <div className="gc-dash-row-main">
            <span className="gc-dash-row-what">
              {item.what}
              {item.shared ? <span className="gc-dash-tag">Shared</span> : null}
            </span>
            <span className="gc-dash-muted" data-state={item.state}>
              {GOCANVAS_WORK_STATE_LABEL[item.state]}
              {item.owner ? ` · ${item.owner}` : ""}
              {item.due
                ? ` · wanted by ${shortDay(item.due)}`
                : item.dueText
                  ? ` · ${item.dueText}`
                  : ""}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ----------------------------------------------------------------- contact */

function Contact({ view }: { view: WelcomeView }) {
  const contact = tisContact(view);
  return (
    <div className="gc-dash-contact">
      {contact.name ? <p className="gc-dash-contact-name">{contact.name}</p> : null}
      {contact.mailto ? (
        <a href={contact.mailto} className="gc-dash-button is-primary">
          <Mail className="gc-dash-icon" aria-hidden="true" /> Email your TIS
        </a>
      ) : (
        <p className="gc-dash-empty">
          No email address is on file yet. Ask your GoCanvas contact how best to reach them.
        </p>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- resources */

function Resources({ view }: { view: WelcomeView }) {
  const resources = dashboardResources(view);
  if (!resources.length) {
    return (
      <p className="gc-dash-empty">Nothing picked yet. Your GoCanvas contact will share some.</p>
    );
  }
  return (
    <ul className="gc-dash-list is-compact">
      {resources.map((r) => (
        <li key={r.id} className="gc-dash-resource">
          <a href={r.href} target="_blank" rel="noreferrer" className="gc-dash-link">
            {r.title} <ExternalLink className="gc-dash-icon" aria-hidden="true" />
          </a>
          <Disclosure label="Details">
            <p className="gc-dash-muted">{r.why}</p>
            {r.when ? <p className="gc-dash-muted">{r.when}</p> : null}
          </Disclosure>
        </li>
      ))}
    </ul>
  );
}
