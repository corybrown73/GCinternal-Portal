import { useState, type ReactNode } from "react";
import { Check, CalendarPlus, Circle, CircleDot, ExternalLink, Mail } from "lucide-react";

import { T, tkey, type WelcomeMode } from "@/components/welcome-primitives";
import { KICKOFF_EXPECTATIONS } from "@/lib/kickoff-view";
import {
  attentionItems,
  dashboardHeader,
  dashboardResources,
  gocanvasWork,
  homeworkTexts,
  ideasForLater,
  nextBookedSession,
  tisContact,
  type AttentionItem,
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
  /** The local day as YYYY-MM-DD, once known. Used to pick the next milestone ahead. */
  today: string | null;
  mode: WelcomeMode;
  onTick?: ((key: HomeworkKey, done: boolean) => Promise<void> | void) | undefined;
  onAnswer?: ((key: string, value: HandoffValue) => Promise<void> | void) | undefined;
  onBall?: ((solutionId: string) => Promise<void> | void) | undefined;
  icsBase: string | null;
}) {
  const interactive = mode === "shared";
  const header = dashboardHeader(view, today);
  return (
    <main className="gc-dash" aria-labelledby="gc-dash-title">
      {mode === "internal" ? (
        <p className="gc-dash-preview" role="note">
          Internal preview of the customer&apos;s dashboard. The customer&apos;s own controls are
          shown here but do nothing.
        </p>
      ) : null}

      <DashHeader view={view} header={header} />

      <Section title="What needs your attention" id="attention">
        <Attention view={view} interactive={interactive} onTick={onTick} onBall={onBall} />
      </Section>

      {view.intake ? (
        <Section title="Your answers before kickoff" id="answers">
          <BeforeKickoff view={view} interactive={interactive} onAnswer={onAnswer} />
        </Section>
      ) : null}

      <Section title="What GoCanvas is working on" id="gocanvas">
        <GocanvasWork view={view} />
      </Section>

      <Section title="Your next working session" id="session">
        <NextSession view={view} icsBase={icsBase} />
      </Section>

      <Section title="Our kickoff agreements" id="agreements">
        <Agreements view={view} />
      </Section>

      <Section title="Resources and contact" id="resources">
        <ResourcesAndContact view={view} />
      </Section>

      <footer className="gc-dash-foot">
        <span>gocanvas.com</span>
      </footer>
    </main>
  );
}

function Section({ title, id, children }: { title: string; id: string; children: ReactNode }) {
  return (
    <section className="gc-dash-section" aria-labelledby={`gc-${id}-title`}>
      <h2 id={`gc-${id}-title`} className="gc-dash-h2">
        {title}
      </h2>
      {children}
    </section>
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
      <div className="gc-dash-brand">
        <img src="/branding/gocanvas-wordmark-navy.png" alt="GoCanvas" className="gc-dash-logo" />
        {view.clientLogoUrl ? (
          <img src={view.clientLogoUrl} alt={view.clientName} className="gc-dash-client-logo" />
        ) : null}
      </div>
      <p className="gc-dash-eyebrow">Your implementation</p>
      <h1 id="gc-dash-title" className="gc-dash-title">
        {view.clientName}
      </h1>

      {header.started ? (
        <>
          <p className="gc-dash-stage">
            <span>Current stage</span> <strong>{header.currentLabel}</strong>
          </p>
          <ol className="gc-dash-bar" aria-label="Implementation progress">
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
        </>
      ) : (
        <p className="gc-dash-stage">Your implementation starts once your account is set up.</p>
      )}

      <div className="gc-dash-facts">
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
              <span className="gc-dash-muted">None recorded yet</span>
            )}
          </span>
        </div>
        <div className="gc-dash-fact">
          <span className="gc-dash-fact-label">Target Graduation</span>
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
  const open = items.filter((i) => !(i.kind === "homework" && i.done));
  const homework = items.filter((i) => i.kind === "homework");
  return (
    <div className="gc-dash-attention">
      {open.length === 0 ? (
        <p className="gc-dash-empty">Nothing is waiting on you right now.</p>
      ) : null}
      <ul className="gc-dash-list">
        {items
          .filter((i) => i.kind !== "homework")
          .map((item) => (
            <AttentionRow key={item.id} item={item} interactive={interactive} onBall={onBall} />
          ))}
      </ul>
      {homework.length ? (
        <div className="gc-dash-homework">
          <h3 className="gc-dash-h3">Your part before the working session</h3>
          <ul className="gc-dash-list">
            {homework.map((h) => {
              const key = h.homeworkKey!;
              const done = h.done;
              const id = `gc-hw-${key}`;
              return (
                <li key={h.id} className="gc-dash-row">
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
                  {h.due ? <span className="gc-dash-muted">Due {shortDay(h.due)}</span> : null}
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

/* ------------------------------------------------- what GoCanvas is working on */

function GocanvasWork({ view }: { view: WelcomeView }) {
  const items = gocanvasWork(view);
  if (!items.length) {
    return <p className="gc-dash-empty">Nothing is recorded for GoCanvas right now.</p>;
  }
  return (
    <ul className="gc-dash-list">
      {items.map((item) => (
        <li key={item.id} className="gc-dash-row">
          <div className="gc-dash-row-main">
            <span className="gc-dash-row-what">
              {item.what}
              {item.shared ? <span className="gc-dash-tag">Shared with your team</span> : null}
            </span>
            <span className="gc-dash-muted">
              {item.status}
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

/* ------------------------------------------------------ next working session */

function NextSession({ view, icsBase }: { view: WelcomeView; icsBase: string | null }) {
  const session = nextBookedSession(view.timeline.milestones);
  if (!session) {
    return <p className="gc-dash-empty">Next working session to be scheduled.</p>;
  }
  return (
    <article className="gc-dash-session">
      <h3 className="gc-dash-h3">{session.label}</h3>
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

/* ---------------------------------------------------------- agreements */

function Agreements({ view }: { view: WelcomeView }) {
  const scope = view.customerScope;
  const ideas = ideasForLater(view.parkingLot);
  return (
    <div className="gc-dash-agreements">
      <div className="gc-dash-block">
        <h3 className="gc-dash-h3">Agreed deliverables</h3>
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

      <div className="gc-dash-block">
        <h3 className="gc-dash-h3">How we&apos;ll work together</h3>
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
      </div>

      <div className="gc-dash-block">
        <h3 className="gc-dash-h3">Ideas and requests for later</h3>
        {ideas.length ? (
          <ul className="gc-dash-list">
            {ideas.map((idea) => (
              <li key={idea.id} className="gc-dash-row">
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
      </div>
    </div>
  );
}

/* --------------------------------------------------- resources and contact */

function ResourcesAndContact({ view }: { view: WelcomeView }) {
  const resources = dashboardResources(view);
  const contact = tisContact(view);
  return (
    <div className="gc-dash-resources">
      <div className="gc-dash-block">
        <h3 className="gc-dash-h3">Resources for you</h3>
        {resources.length ? (
          <ul className="gc-dash-list">
            {resources.map((r) => (
              <li key={r.id} className="gc-dash-row">
                <div className="gc-dash-row-main">
                  <a href={r.href} target="_blank" rel="noreferrer" className="gc-dash-link">
                    {r.title} <ExternalLink className="gc-dash-icon" aria-hidden="true" />
                  </a>
                  <span className="gc-dash-muted">{r.why}</span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="gc-dash-empty">
            Nothing picked yet. Your GoCanvas contact will share resources.
          </p>
        )}
      </div>

      <aside className="gc-dash-contact" aria-labelledby="gc-contact-title">
        <h3 id="gc-contact-title" className="gc-dash-h3">
          Contact your TIS
        </h3>
        {contact.name ? <p className="gc-dash-contact-name">{contact.name}</p> : null}
        {contact.mailto ? (
          <a href={contact.mailto} className="gc-dash-button is-primary">
            <Mail className="gc-dash-icon" aria-hidden="true" /> Email your TIS
          </a>
        ) : (
          <p className="gc-dash-empty">
            No email address is on file for your implementation contact yet. Ask your GoCanvas
            contact for the best way to reach them.
          </p>
        )}
      </aside>
    </div>
  );
}
