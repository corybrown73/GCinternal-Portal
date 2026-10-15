import type { Customer360 } from "@/lib/hub-types";
import type { DealData } from "@/lib/deal-query";
import { readIntake, type IntakeAnswers } from "@/lib/intake-answers";
import { closeDateFor, timelineFor } from "@/lib/onboarding-plan";
import { normalizeServices, type ServiceSpec } from "@/lib/onboarding-services";
import { shortDay } from "@/lib/onboarding-timeline";
import { wonStage } from "@/lib/pipeline-stages";
import { hasSowOnFile } from "@/lib/won-gate";
import { workspaceFor, type WorkspaceInput } from "@/lib/workspace";
import {
  partnerDashboardView,
  partnerWorkspace,
  type PartnerProgress,
} from "@/lib/partner-journey";
import {
  journeyPosition,
  focusHeadline,
  taskFocusFor,
  taskProgress,
  type TaskFocus,
} from "@/lib/current-implementation-focus";
import {
  CANONICAL_JOURNEY_KEYS,
  isWorkingStageKey,
  stageFlow,
  type FlowStageKey,
  type StageFlow,
} from "@/lib/stage-flow";

/**
 * The Customer 360 Overview's model. Pure, so the rules are tested without a
 * page. Every value is read from the source Current Implementation reads it
 * from, with the same inputs and calls. Nothing here invents a date, a
 * progress figure or a status.
 */

export type Impl = NonNullable<Customer360["implementation"]>;
/** The tones the Hub's status chips use (see TONE in current-implementation-context). */
export type Tone = "critical" | "warning" | "info" | "good";
/** A date tile's tint: a tone when the date is set, or soft or unset otherwise. */
export type Tint = Tone | "soft" | "unset";

/** One of the four agreed dates, already decided: its tint, and whether it is set. */
export type DateTile = {
  key: string;
  label: string;
  value: string;
  hint: string;
  tint: Tint;
  featured?: boolean;
};

/** The read-only next action: the headline Focus Mode shows for the stage. */
export type NextLine = { label: string; text: string; tone: Tone };

/** What the snapshot shows, whichever journey the implementation runs. */
export type SnapshotModel = {
  stageLabel: string | null;
  position: { index: number; total: number } | null;
  fallback: string;
  caption: string | null;
  next: NextLine | null;
  owner: string | null;
  ball: { who: "customer" | "us" } | null;
  waiting: { who: "customer" | "gocanvas"; what: string }[];
  waitingText: string | null;
  dates: DateTile[];
};

/** The day part of a stored date, or null when the value is not one. */
export function isoDay(value: string | null | undefined): string | null {
  return value && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null;
}

/**
 * Actual go-live: the recorded go-live first, the Go-Live tick (go_live_at,
 * exposed as dates.go_live), then the typed actual launch date. This is the
 * order the Calendar's "Actual go-live" uses. Neither field is written here.
 */
export function actualGoLive(impl: Pick<Impl, "dates" | "actual_launch_date">): string | null {
  return isoDay(impl.dates.go_live) ?? isoDay(impl.actual_launch_date);
}

/**
 * Functional by is shown only where Current Implementation shows it: a new
 * logo, at pre-kickoff or a working stage. Any other case gets no tile.
 */
export function functionalByApplies(
  intake: Pick<IntakeAnswers, "path"> | null,
  current: FlowStageKey | null,
): boolean {
  return Boolean(
    intake &&
    intake.path === "new_logo" &&
    (isWorkingStageKey(current) || current === "pre_kickoff"),
  );
}

/** The next action for a stage, from the focus rule Focus Mode already uses. */
export function nextLineFor(focus: TaskFocus | null): NextLine | null {
  if (!focus) return null;
  if (focus.state === "next") {
    return { label: "Up next", text: focusHeadline(focus.next), tone: "info" };
  }
  if (focus.state === "waiting") {
    return {
      label: "Waiting",
      text: focus.blocker.locked ?? focusHeadline(focus.blocker),
      tone: "warning",
    };
  }
  if (focus.state === "complete") {
    return { label: "Stage complete", text: "Every task in this stage is done", tone: "good" };
  }
  return null;
}

/**
 * A standard implementation's snapshot, from the same inputs and calls Current
 * Implementation makes. Without the deal there is no stage flow, so the stage
 * parts stay empty and the dates use only what the implementation records.
 */
export function standardSnapshot(input: {
  impl: Impl;
  deal: DealData | null;
  today: string;
  parkingLot: WorkspaceInput["parkingLot"];
  homeworkDone: WorkspaceInput["homeworkDone"];
  link: WorkspaceInput["link"];
  hasGraduationBrief: boolean;
}): SnapshotModel {
  const { impl, deal, today } = input;
  const intake = deal ? readIntake(deal.account.intake) : null;
  const close =
    deal && intake
      ? closeDateFor({
          intake,
          stageHistory: deal.stage_history,
          wonStageKey: wonStage(deal.stages).key,
          today,
        })
      : null;
  const timeline = intake && close ? timelineFor(intake, close.date) : null;
  const flow: StageFlow | null =
    deal && intake && timeline
      ? stageFlow({
          stage: deal.account.stage,
          intake,
          owner: impl.owner_name,
          gongReports: deal.gong_reports.length,
          hasSow: hasSowOnFile(deal.account),
          hasBrief: deal.briefs.some((b) => b.status === "complete" && b.generator === "llm"),
          hasLink: Boolean(
            (deal.account as { welcome_share_url?: string | null }).welcome_share_url,
          ),
          timeline,
          hasGraduationBrief: input.hasGraduationBrief,
        })
      : null;
  const ws =
    flow && intake && timeline
      ? workspaceFor({
          flow,
          intake,
          timeline,
          today,
          parkingLot: input.parkingLot,
          homeworkDone: input.homeworkDone,
          link: input.link,
        })
      : null;

  const canonicalStages = flow
    ? flow.stages.filter((s) => CANONICAL_JOURNEY_KEYS.includes(s.key))
    : [];
  const currentInCanon: FlowStageKey | null =
    flow?.current && CANONICAL_JOURNEY_KEYS.includes(flow.current) ? flow.current : null;
  const position = currentInCanon
    ? journeyPosition(
        canonicalStages.map((s) => s.key),
        currentInCanon,
      )
    : null;
  const stage = canonicalStages.find((s) => s.key === currentInCanon) ?? null;
  const counter = stage ? taskProgress(stage.tasks) : null;

  const functionalApplies = functionalByApplies(intake, flow?.current ?? null);
  const agreed = intake?.timeline.stage_targets.complete.current_date ?? null;
  const planEnd = isoDay(impl.dates.target);
  const functionalBy = functionalApplies ? isoDay(timeline?.liveDate) : null;
  const actual = actualGoLive(impl);

  const dates: DateTile[] = [
    {
      key: "graduation",
      label: "Target graduation",
      value: agreed ? shortDay(agreed) : deal ? "Not agreed yet" : "Not set",
      hint: "What the customer sees",
      tint: agreed ? "good" : "unset",
      featured: true,
    },
    {
      key: "plan-end",
      label: "Plan end",
      value: planEnd ? shortDay(planEnd) : "Not set",
      hint: "Planned completion of purchased work",
      tint: planEnd ? "info" : "unset",
    },
  ];
  if (functionalApplies) {
    dates.push({
      key: "functional-by",
      label: "Functional by",
      value: functionalBy ? shortDay(functionalBy) : "Not set",
      hint: "Planned first usable solution",
      tint: functionalBy ? "soft" : "unset",
    });
  }
  dates.push({
    key: "actual-go-live",
    label: "Actual go-live",
    value: actual ? shortDay(actual) : "Not recorded",
    hint: "Recorded go-live",
    tint: actual ? "good" : "unset",
  });

  return {
    stageLabel: stage?.label ?? null,
    position,
    fallback: "Before the journey starts",
    caption: counter ? `${counter.done} of ${counter.total} tasks done` : null,
    next: nextLineFor(stage ? taskFocusFor(stage.tasks) : null),
    owner: impl.owner_name,
    ball: ws?.ball ? { who: ws.ball.who } : null,
    waiting: ws?.waiting ?? [],
    waitingText: ws && ws.waiting.length === 0 ? "Nothing on anyone's desk" : null,
    dates,
  };
}

/** What partnerWorkspace says when the current stage has nothing open. */
const NOTHING_OPEN = "Nothing open";

/**
 * A partner implementation's snapshot. Its dates are the partner's own: the Roll Out
 * target and the recorded actual go-live. The implementation's target fields are
 * not shown as a partner date, because the standard plan can write them, so they
 * are not an authoritative partner target., from the partner's own progress only.
 * Nothing standard appears: no Functional by, and no standard plan or target.
 * While the progress is loading or has failed, the stage says so.
 */
export function partnerSnapshot(
  impl: Impl,
  progress: PartnerProgress | null,
  state: { loading: boolean; failed: boolean },
): SnapshotModel {
  const strip = progress ? partnerWorkspace(progress) : null;
  const position = progress?.current
    ? journeyPosition(
        progress.stages.map((s) => s.key),
        progress.current,
      )
    : null;
  const graduation = progress ? partnerDashboardView(progress).graduationTarget : null;
  const actual = actualGoLive(impl);

  return {
    stageLabel: strip?.stageLabel ?? null,
    position: position ? { index: position.index, total: progress?.stages.length ?? 0 } : null,
    fallback: state.loading ? "Loading…" : state.failed ? "Stage unavailable" : "Not started",
    caption: null,
    // The partner's own wording for a stage with nothing open. There is no next
    // action to preview then, so the row is left out rather than reading "Up next".
    next:
      strip && strip.nextAction !== NOTHING_OPEN
        ? { label: "Up next", text: strip.nextAction, tone: "info" }
        : null,
    owner: impl.owner_name,
    ball: null,
    waiting: [],
    waitingText: strip
      ? strip.waitingOn
      : state.loading
        ? "Loading…"
        : state.failed
          ? "Unavailable"
          : null,
    dates: [
      {
        key: "graduation",
        label: "Graduation target",
        value: graduation
          ? shortDay(graduation)
          : progress
            ? "To be confirmed"
            : state.failed
              ? "Unavailable"
              : "Loading…",
        hint: "The partner's Roll Out target",
        tint: graduation ? "good" : "unset",
        featured: true,
      },
      {
        key: "actual-go-live",
        label: "Actual go-live",
        value: actual ? shortDay(actual) : "Not recorded",
        hint: "Recorded go-live",
        tint: actual ? "good" : "unset",
      },
    ],
  };
}

/* ------------------------------------------------------------ Key people */

/** Customer roles that decide. Every other customer role is a working contact. */
const DECISION_ROLES: readonly string[] = ["exec_sponsor", "decision_maker"];

export type ContactLike = { id: string; name: string; role: string; email: string | null };

/** Contacts split into decision-makers (sponsors first) and working contacts (by name). */
export function splitContacts<C extends ContactLike>(
  contacts: readonly C[],
): {
  decision: C[];
  working: C[];
} {
  const byName = (a: C, b: C) => a.name.localeCompare(b.name);
  const decision = contacts
    .filter((c) => DECISION_ROLES.includes(c.role))
    .sort(
      (a, b) => DECISION_ROLES.indexOf(a.role) - DECISION_ROLES.indexOf(b.role) || byName(a, b),
    );
  const working = contacts.filter((c) => !DECISION_ROLES.includes(c.role)).sort(byName);
  return { decision, working };
}

export type InternalOwner = { key: string; name: string; sub: string };

/** Our side of the account: the implementation owner, the sales owner and each technical solution owner, once each. */
export function internalOwners(
  impl: Pick<Impl, "owner_name" | "sales_owner">,
  solutions: ReadonlyArray<{ owner_name?: string | null }>,
): InternalOwner[] {
  const people: InternalOwner[] = [];
  if (impl.owner_name) {
    people.push({ key: "owner", name: impl.owner_name, sub: "Implementation owner" });
  }
  if (impl.sales_owner && impl.sales_owner !== impl.owner_name) {
    people.push({ key: "sales", name: impl.sales_owner, sub: "Sales owner" });
  }
  const names = Array.from(
    new Set(solutions.map((s) => s.owner_name).filter((n): n is string => Boolean(n))),
  );
  for (const name of names) {
    if (name === impl.owner_name) continue;
    people.push({ key: `solution-${name}`, name, sub: "Technical solution owner" });
  }
  return people;
}

/** Two letters from a name: first and last word. "?" when there is no name. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase() || "?";
}

/** The services a deal's intake lists, normalised the way the deal's own pages read them. */
export function servicesFor(deal: DealData | null): ReturnType<typeof normalizeServices> {
  if (!deal) return [];
  const intake = readIntake(deal.account.intake);
  return normalizeServices(intake.timeline.services as ServiceSpec[], intake.timeline);
}
