import { businessDaysBetween } from "./onboarding-timeline";
import { STAGE_LABELS, type AccountStage } from "./presale-stages";

/**
 * The daily pipeline report, as data. Pure: the server gathers one row per
 * deal, this counts and sorts, and the same object feeds the MCP tool and
 * the morning email — so Claude and the inbox never disagree.
 *
 * Every rule here is one the checklist already uses: "stuck" is the stage
 * limit table, "next" is the checklist's next task, business days are the
 * plan's own unit.
 */
export type ReportDeal = {
  id: string;
  name: string;
  stage: AccountStage;
  owner: string | null;
  nextStep: string | null;
  stuck: "ok" | "warn" | "escalate";
  businessDaysInStage: number;
  hasGongBrief: boolean;
  hasSow: boolean;
  hasAiBrief: boolean;
  /** ISO timestamps. */
  closedAt: string | null;
  onboardingAt: string | null;
  liveOn: string | null;
  lastActivityAt: string;
};

export type PipelineReport = {
  asOf: string;
  stages: Array<{
    stage: AccountStage;
    label: string;
    count: number;
    warn: number;
    escalate: number;
  }>;
  stuck: Array<
    Pick<ReportDeal, "name" | "stage" | "owner" | "nextStep" | "businessDaysInStage" | "stuck"> & {
      label: string;
    }
  >;
  untouched: Array<{
    name: string;
    label: string;
    owner: string | null;
    businessDaysQuiet: number;
    nextStep: string | null;
  }>;
  gong: {
    withBrief: number;
    without: Array<{ name: string; label: string; owner: string | null }>;
  };
  unclaimed: Array<{ name: string; businessDaysInStage: number }>;
  timeToOnboarding: Timing;
  timeToFirstFormLive: Timing;
};

export type Timing = {
  /** Deals the number is measured over. */
  count: number;
  median: number | null;
  average: number | null;
  /** The slowest, for a name to go and ask about. */
  slowest: { name: string; days: number } | null;
};

/** The stages a person is working, in order. Prospect and Complete are counted, not chased. */
const ORDER: AccountStage[] = [
  "prospect",
  "closed_won",
  "field_fusion_setup",
  "onboarding_kickoff",
  "in_onboarding",
  "onboarding_complete",
];
const WORKED = new Set<AccountStage>([
  "closed_won",
  "field_fusion_setup",
  "onboarding_kickoff",
  "in_onboarding",
]);

export function buildPipelineReport(
  deals: readonly ReportDeal[],
  today: string,
  opts: { untouchedAfter?: number; since?: string | null } = {},
): PipelineReport {
  const quietAfter = opts.untouchedAfter ?? 3;
  const label = (s: AccountStage) => STAGE_LABELS[s] ?? s;
  const worked = deals.filter((d) => WORKED.has(d.stage));

  const stages = ORDER.map((stage) => {
    const here = deals.filter((d) => d.stage === stage);
    return {
      stage,
      label: label(stage),
      count: here.length,
      warn: here.filter((d) => d.stuck === "warn").length,
      escalate: here.filter((d) => d.stuck === "escalate").length,
    };
  }).filter((s) => s.count > 0 || WORKED.has(s.stage));

  const stuck = worked
    .filter((d) => d.stuck !== "ok")
    .sort(
      (a, b) =>
        Number(b.stuck === "escalate") - Number(a.stuck === "escalate") ||
        b.businessDaysInStage - a.businessDaysInStage,
    )
    .map((d) => ({
      name: d.name,
      stage: d.stage,
      label: label(d.stage),
      owner: d.owner,
      nextStep: d.nextStep,
      businessDaysInStage: d.businessDaysInStage,
      stuck: d.stuck,
    }));

  const untouched = worked
    .map((d) => ({
      d,
      quiet: Math.max(0, businessDaysBetween(d.lastActivityAt.slice(0, 10), today)),
    }))
    .filter((x) => x.quiet >= quietAfter)
    .sort((a, b) => b.quiet - a.quiet)
    .map(({ d, quiet }) => ({
      name: d.name,
      label: label(d.stage),
      owner: d.owner,
      businessDaysQuiet: quiet,
      nextStep: d.nextStep,
    }));

  // The Gong brief matters from the close on: before it, the calls are
  // still happening.
  const needBrief = worked;
  const gong = {
    withBrief: needBrief.filter((d) => d.hasGongBrief).length,
    without: needBrief
      .filter((d) => !d.hasGongBrief)
      .map((d) => ({ name: d.name, label: label(d.stage), owner: d.owner })),
  };

  const unclaimed = deals
    .filter((d) => d.stage === "closed_won" && !d.owner)
    .map((d) => ({ name: d.name, businessDaysInStage: d.businessDaysInStage }));

  const since = opts.since ?? null;
  const inWindow = (d: ReportDeal) => !since || (d.closedAt ?? "") >= since;
  const toOnboarding = timing(
    deals
      .filter((d) => d.closedAt && d.onboardingAt && inWindow(d))
      .map((d) => ({
        name: d.name,
        days: businessDaysBetween(d.closedAt!.slice(0, 10), d.onboardingAt!.slice(0, 10)),
      })),
  );
  const toLive = timing(
    deals
      .filter((d) => d.closedAt && d.liveOn && inWindow(d))
      .map((d) => ({
        name: d.name,
        days: businessDaysBetween(d.closedAt!.slice(0, 10), d.liveOn!),
      })),
  );

  return {
    asOf: today,
    stages,
    stuck,
    untouched,
    gong,
    unclaimed,
    timeToOnboarding: toOnboarding,
    timeToFirstFormLive: toLive,
  };
}

function timing(rows: Array<{ name: string; days: number }>): Timing {
  const days = rows.map((r) => Math.max(0, r.days)).sort((a, b) => a - b);
  if (!days.length) return { count: 0, median: null, average: null, slowest: null };
  const mid = Math.floor(days.length / 2);
  const median = days.length % 2 ? days[mid]! : Math.round((days[mid - 1]! + days[mid]!) / 2);
  const slow = [...rows].sort((a, b) => b.days - a.days)[0]!;
  return {
    count: days.length,
    median,
    average: Math.round((days.reduce((a, b) => a + b, 0) / days.length) * 10) / 10,
    slowest: { name: slow.name, days: Math.max(0, slow.days) },
  };
}

/** The report as Markdown: what the MCP tool hands Claude, and the email's body. */
export function reportMarkdown(r: PipelineReport): string {
  const out: string[] = [];
  out.push(`# Onboarding pipeline — ${r.asOf}`);
  out.push("");
  out.push("| Stage | Deals | Waiting too long | Stuck |");
  out.push("|---|---|---|---|");
  for (const s of r.stages)
    out.push(`| ${s.label} | ${s.count} | ${s.warn || "—"} | ${s.escalate || "—"} |`);
  out.push("");
  out.push(
    `**Time to onboarding** (close → kickoff booked): ${fmtTiming(r.timeToOnboarding)}. **Time to first form live:** ${fmtTiming(r.timeToFirstFormLive)}.`,
  );
  out.push("");
  if (r.unclaimed.length) {
    out.push(`## Unclaimed (${r.unclaimed.length})`);
    for (const u of r.unclaimed)
      out.push(`- ${u.name} — closed ${u.businessDaysInStage} business days ago`);
    out.push("");
  }
  out.push(`## Stuck or slow (${r.stuck.length})`);
  if (!r.stuck.length) out.push("- Nothing past its stage limit.");
  for (const s of r.stuck)
    out.push(
      `- ${s.stuck === "escalate" ? "🔴" : "🟠"} **${s.name}** — ${s.label}, ${s.businessDaysInStage} business days · ${s.owner ?? "no owner"}${s.nextStep ? ` · next: ${s.nextStep}` : ""}`,
    );
  out.push("");
  out.push(`## Untouched 3+ business days (${r.untouched.length})`);
  if (!r.untouched.length) out.push("- Every deal moved recently.");
  for (const u of r.untouched)
    out.push(
      `- **${u.name}** — ${u.label}, quiet ${u.businessDaysQuiet} days · ${u.owner ?? "no owner"}${u.nextStep ? ` · next: ${u.nextStep}` : ""}`,
    );
  out.push("");
  const total = r.gong.withBrief + r.gong.without.length;
  out.push(`## Gong brief: ${r.gong.withBrief} of ${total} closed deals have one`);
  for (const g of r.gong.without)
    out.push(`- Missing: **${g.name}** — ${g.label} · ${g.owner ?? "no owner"}`);
  return out.join("\n");
}

function fmtTiming(t: Timing): string {
  if (!t.count) return "not enough deals yet";
  return `median ${t.median} business days, average ${t.average} (${t.count} deal${t.count === 1 ? "" : "s"}${t.slowest ? `; slowest ${t.slowest.name}, ${t.slowest.days}` : ""})`;
}

/** The report as an email: the same sections as the Markdown, in the house style. */
export function reportHtml(r: PipelineReport, boardUrl: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const cell = "padding:6px 10px;border-bottom:1px solid #e3e8ef";
  const rows = r.stages
    .map(
      (s) =>
        `<tr><td style="${cell}">${esc(s.label)}</td><td style="${cell};text-align:right"><b>${s.count}</b></td><td style="${cell};text-align:right;color:#b45309">${s.warn || "—"}</td><td style="${cell};text-align:right;color:#b91c1c">${s.escalate || "—"}</td></tr>`,
    )
    .join("");
  const list = (items: string[], empty: string) =>
    items.length
      ? `<ul style="margin:6px 0 16px;padding-left:18px;line-height:1.6">${items.map((i) => `<li>${i}</li>`).join("")}</ul>`
      : `<p style="margin:6px 0 16px;color:#556477">${empty}</p>`;
  const who = (o: string | null) => (o ? esc(o) : `<span style="color:#b91c1c">no owner</span>`);
  const next = (n: string | null) => (n ? ` · next: ${esc(n)}` : "");
  const total = r.gong.withBrief + r.gong.without.length;
  return `<div style="font-family:sans-serif;max-width:640px;color:#0a1628">
  <p style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#039de7;margin:0 0 4px">Daily report · ${esc(r.asOf)}</p>
  <h2 style="margin:0 0 12px;color:#072b57">Onboarding pipeline</h2>
  <table style="border-collapse:collapse;width:100%;font-size:13px;margin-bottom:12px">
    <tr style="text-align:left;color:#556477;font-size:11px;text-transform:uppercase"><th style="${cell}">Stage</th><th style="${cell};text-align:right">Deals</th><th style="${cell};text-align:right">Slow</th><th style="${cell};text-align:right">Stuck</th></tr>
    ${rows}
  </table>
  <p style="font-size:13px;margin:0 0 16px"><b>Close → onboarding:</b> ${esc(fmtTiming(r.timeToOnboarding))}<br/><b>Close → first form live:</b> ${esc(fmtTiming(r.timeToFirstFormLive))}</p>
  ${
    r.unclaimed.length
      ? `<h3 style="margin:0;color:#b91c1c;font-size:14px">Unclaimed (${r.unclaimed.length})</h3>${list(
          r.unclaimed.map(
            (u) => `<b>${esc(u.name)}</b> — closed ${u.businessDaysInStage} business days ago`,
          ),
          "",
        )}`
      : ""
  }
  <h3 style="margin:0;font-size:14px">Stuck or slow (${r.stuck.length})</h3>
  ${list(
    r.stuck.map(
      (s) =>
        `${s.stuck === "escalate" ? "🔴" : "🟠"} <b>${esc(s.name)}</b> — ${esc(s.label)}, ${s.businessDaysInStage} business days · ${who(s.owner)}${next(s.nextStep)}`,
    ),
    "Nothing past its stage limit.",
  )}
  <h3 style="margin:0;font-size:14px">Untouched 3+ business days (${r.untouched.length})</h3>
  ${list(
    r.untouched.map(
      (u) =>
        `<b>${esc(u.name)}</b> — ${esc(u.label)}, quiet ${u.businessDaysQuiet} days · ${who(u.owner)}${next(u.nextStep)}`,
    ),
    "Every deal moved recently.",
  )}
  <h3 style="margin:0;font-size:14px">Gong brief: ${r.gong.withBrief} of ${total} closed deals</h3>
  ${list(
    r.gong.without.map((g) => `Missing: <b>${esc(g.name)}</b> — ${esc(g.label)} · ${who(g.owner)}`),
    "Every closed deal has its Gong brief.",
  )}
  <p><a href="${boardUrl}" style="color:#039de7">Open the pipeline board</a></p>
  <p style="font-size:12px;color:#888">GoCanvas Handoff Hub · every weekday morning · ask Claude "pipeline report" any time</p>
</div>`;
}
