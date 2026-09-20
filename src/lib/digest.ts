/**
 * The Monday digest: what each person owes this week, in one email.
 *
 * WHY. The current process finishes about one project in ten, and the way
 * a project dies is quiet: it sits, nobody is told, and the page that would
 * have shown it was never opened. This email is the tool coming to the
 * person instead of waiting to be opened. Same sources as Home, same words,
 * so nobody reads one story in their inbox and another on the page.
 *
 * Pure: composition and rendering only. `digest.server.ts` gathers the
 * inputs and sends.
 */

export type DigestDeal = {
  id: string;
  name: string;
  stage_label: string;
  days_in_stage: number;
  next_step: string | null;
  unclaimed: boolean;
  owner_name: string | null;
};

export type DigestImpl = {
  id: string;
  customer_id: string;
  customer_name: string;
  reason: string;
  next_action: string;
  owner_name: string | null;
};

export type DigestMilestone = {
  deal_id: string;
  deal_name: string;
  label: string;
  /** ISO date the plan says. */
  date: string;
  /** Positive when late. */
  days_late: number;
  owner: "gocanvas" | "client" | "both";
};

export type TeamRollupRow = {
  owner_name: string;
  needs_action: number;
  keep_an_eye: number;
  deals: number;
  overdue_milestones: number;
};

export type Digest = {
  recipient_name: string;
  /** ISO date of the Monday this digest is for. */
  week_of: string;
  unclaimed_deals: DigestDeal[];
  my_deals: DigestDeal[];
  needs_action: DigestImpl[];
  keep_an_eye: DigestImpl[];
  overdue_milestones: DigestMilestone[];
  this_week_milestones: DigestMilestone[];
  /** Managers only: the whole team, one row per owner. */
  team: TeamRollupRow[] | null;
};

/** Nothing owed, nothing waiting, nothing to roll up: the email is not sent. */
export function digestIsEmpty(d: Digest): boolean {
  return (
    d.unclaimed_deals.length === 0 &&
    d.my_deals.length === 0 &&
    d.needs_action.length === 0 &&
    d.keep_an_eye.length === 0 &&
    d.overdue_milestones.length === 0 &&
    d.this_week_milestones.length === 0 &&
    (d.team === null || d.team.length === 0)
  );
}

/** "Monday: 2 overdue · 3 due this week · 1 unclaimed deal" — the counts, nothing else. */
export function digestSubject(d: Digest): string {
  const parts: string[] = [];
  const overdue = d.overdue_milestones.length + d.needs_action.length;
  if (overdue) parts.push(`${overdue} overdue`);
  if (d.this_week_milestones.length) parts.push(`${d.this_week_milestones.length} due this week`);
  if (d.unclaimed_deals.length)
    parts.push(
      `${d.unclaimed_deals.length} unclaimed deal${d.unclaimed_deals.length === 1 ? "" : "s"}`,
    );
  if (parts.length === 0) {
    return d.team && d.team.length ? "Monday: the team's week" : "Monday: nothing overdue";
  }
  return `Monday: ${parts.join(" · ")}`;
}

/** The Monday on or before `today`, ISO. */
export function weekOf(today: Date): string {
  const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const dow = d.getUTCDay(); // 0 Sunday
  const back = dow === 0 ? 6 : dow - 1;
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}

/** Whole days from `a` to `b`; positive when `b` is later. */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function shortDate(iso: string): string {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

const OWNER_WORD: Record<DigestMilestone["owner"], string> = {
  gocanvas: "us",
  client: "the customer",
  both: "both sides",
};

/**
 * The email. Plain HTML, one column, no images: it has to read in Outlook on
 * a phone. Each section is a list with the link on the name, and the first
 * line of each section says why it is there.
 */
export function renderDigestHtml(d: Digest, appUrl: string): string {
  const base = appUrl.replace(/\/$/, "");
  const deal = (x: { id: string; name: string }) =>
    `<a href="${base}/deals/${x.id}" style="color:#12509b;text-decoration:none;font-weight:600">${esc(x.name)}</a>`;
  const impl = (x: DigestImpl) =>
    `<a href="${base}/customers/${x.customer_id}?tab=overview&amp;impl=${x.id}" style="color:#12509b;text-decoration:none;font-weight:600">${esc(x.customer_name)}</a>`;

  const section = (title: string, lead: string, items: string[]) =>
    items.length
      ? `<h3 style="margin:26px 0 4px;font-size:14px;color:#072b57">${esc(title)}</h3>
         <p style="margin:0 0 8px;font-size:12px;color:#556477">${esc(lead)}</p>
         <ul style="margin:0;padding-left:18px;font-size:13px;line-height:1.7">${items.join("")}</ul>`
      : "";

  const li = (s: string) => `<li style="margin:0 0 4px">${s}</li>`;
  const muted = (s: string) => `<span style="color:#556477">${esc(s)}</span>`;

  const first = d.recipient_name.split(" ")[0] || d.recipient_name;

  const body = [
    section(
      "Overdue on your plans",
      "Steps the customer was promised by a date that has passed. Each one is a promise slipping in front of them.",
      d.overdue_milestones.map((m) =>
        li(
          `${deal({ id: m.deal_id, name: m.deal_name })} — ${esc(m.label)} ${muted(
            `· ${shortDate(m.date)} · ${m.days_late} day${m.days_late === 1 ? "" : "s"} late · ${OWNER_WORD[m.owner]}`,
          )}`,
        ),
      ),
    ),
    section(
      "Needs action",
      "Implementations Home would put at the top of your list, with the reason.",
      d.needs_action.map((x) =>
        li(`${impl(x)} — ${esc(x.reason)} ${muted(`· next: ${x.next_action}`)}`),
      ),
    ),
    section(
      "Due this week",
      "Plan steps that land in the next seven days. Nothing is late yet.",
      d.this_week_milestones.map((m) =>
        li(
          `${deal({ id: m.deal_id, name: m.deal_name })} — ${esc(m.label)} ${muted(
            `· ${shortDate(m.date)} · ${OWNER_WORD[m.owner]}`,
          )}`,
        ),
      ),
    ),
    section(
      "Unclaimed deals",
      "Closed or closing deals with no implementation owner. The first person to claim one owns it.",
      d.unclaimed_deals.map((x) =>
        li(
          `${deal(x)} ${muted(`· ${x.stage_label} · ${x.days_in_stage}d waiting${x.next_step ? ` · next: ${x.next_step}` : ""}`)}`,
        ),
      ),
    ),
    section(
      "Your deals before kickoff",
      "Deals you own that have not started onboarding, with the next step from the deal page.",
      d.my_deals.map((x) =>
        li(
          `${deal(x)} ${muted(`· ${x.stage_label} · ${x.days_in_stage}d${x.next_step ? ` · next: ${x.next_step}` : ""}`)}`,
        ),
      ),
    ),
    section(
      "Keep an eye on",
      "Not urgent this week, but drifting.",
      d.keep_an_eye.map((x) => li(`${impl(x)} — ${esc(x.reason)}`)),
    ),
    d.team && d.team.length
      ? `<h3 style="margin:26px 0 4px;font-size:14px;color:#072b57">The team</h3>
         <p style="margin:0 0 8px;font-size:12px;color:#556477">One row per owner. Overdue plan steps and "needs action" counts are the ones to ask about.</p>
         <table style="border-collapse:collapse;font-size:13px;width:100%">
           <tr style="color:#556477;font-size:11px;text-transform:uppercase;letter-spacing:.06em">
             <td style="padding:4px 8px 4px 0">Owner</td><td style="padding:4px 8px;text-align:right">Overdue steps</td><td style="padding:4px 8px;text-align:right">Needs action</td><td style="padding:4px 8px;text-align:right">Keep an eye</td><td style="padding:4px 0 4px 8px;text-align:right">Deals</td>
           </tr>
           ${d.team
             .map(
               (r) =>
                 `<tr style="border-top:1px solid #e3e8ef"><td style="padding:6px 8px 6px 0;font-weight:600">${esc(r.owner_name)}</td><td style="padding:6px 8px;text-align:right${r.overdue_milestones ? ";color:#b42318;font-weight:600" : ""}">${r.overdue_milestones}</td><td style="padding:6px 8px;text-align:right${r.needs_action ? ";color:#b42318;font-weight:600" : ""}">${r.needs_action}</td><td style="padding:6px 8px;text-align:right">${r.keep_an_eye}</td><td style="padding:6px 0 6px 8px;text-align:right">${r.deals}</td></tr>`,
             )
             .join("")}
         </table>`
      : "",
  ].join("");

  return `
  <div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:560px;color:#0f1c2e">
    <p style="margin:0 0 2px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#556477">GoCanvas Handoff Hub · week of ${esc(shortDate(d.week_of))}</p>
    <h2 style="margin:0 0 6px;font-size:20px;color:#072b57">${esc(first)}, here is your week.</h2>
    <p style="margin:0;font-size:13px;color:#556477">${esc(digestSubject(d).replace(/^Monday: /, ""))}. Everything below is live on <a href="${base}/" style="color:#12509b">Home</a>.</p>
    ${body || `<p style="margin:24px 0;font-size:13px">Nothing is overdue and nothing is waiting on you. Enjoy the quiet Monday.</p>`}
    <p style="margin:32px 0 0;font-size:11px;color:#8a97a8">Sent every Monday morning to everyone with a book of work. The same lists are on Home, in the same order.</p>
  </div>`;
}
