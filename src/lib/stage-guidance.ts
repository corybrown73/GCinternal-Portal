import type { FlowStageKey } from "./stage-flow";

/**
 * Stage guidance for the canonical implementation journey (Kickoff through
 * Graduate) — read-only reference content, not tracked state. The Hub's own
 * tasks and gates (stage-flow.ts) remain the source of truth for what is
 * actually done; nothing here is saved, and selecting a stuck scenario never
 * writes anything. A stage with no entry here (Prospect, Closed Won, Intake
 * & Process) has no guidance yet.
 *
 * Written for a TIS doing the work — during the implementation or on a
 * customer call — not for someone learning an implementation methodology.
 */

export type StuckPrompt = {
  key: string;
  /** Button label: a recognizable description of the situation. */
  label: string;
  /** Short status heading shown once this scenario is selected. */
  status: string;
  /** 3-4 concrete, imperative next actions. */
  actions: readonly string[];
  /** Whether this stops the TIS from moving to the next stage right now. */
  blocks: boolean;
  /** One line stating whether/why this blocks progression. */
  gate: string;
};

export type StageGuidance = {
  /** One plain-language instruction: what the TIS is trying to get done now. */
  objective: string;
  /** One or two concrete sentences expanding on the objective. */
  objectiveDetail: string;
  /** "Before you move on, confirm" — observable, yes/no facts. */
  checks: readonly string[];
  stuck: readonly StuckPrompt[];
  /** Heading for the readiness section, e.g. "Ready for Get It Working when". */
  readyLabel: string;
  readyWhen: readonly string[];
  /** Short "Next" label, e.g. "Get It Working" or "TAM · AM · Scaled CSM". */
  next: string;
};

const ISSUES: Record<
  string,
  { status: string; actions: readonly string[]; blocks: boolean; gate: string }
> = {
  process: {
    status: "BLOCKED: PROCESS UNCLEAR",
    actions: [
      "Go back to the real work — ask them to walk you through the last time someone did it.",
      "Follow it step by step: trigger, steps, exceptions, where the information ends up, who owns the result.",
      "Write down what you learn in plain language.",
      "Confirm it with the customer before building anything.",
    ],
    blocks: true,
    gate: "Don't build until the process is clear — building on a guess just creates rework.",
  },
  notready: {
    status: "RESET: NOT ENOUGH TO SHOW",
    actions: [
      "Identify exactly what information is missing.",
      "Go get it — from the AE, the SOW, or the customer directly.",
      "Build the smallest useful starting point with what you now have.",
      "Rebook Kickoff once you have something real to show.",
    ],
    blocks: true,
    gate: "Don't run Kickoff as a blank-page meeting — get something tangible first.",
  },
  different: {
    status: "CUSTOMER WANTS SOMETHING DIFFERENT",
    actions: [
      "Ask what happens because of the information they're asking about.",
      "Find out what changed since the SOW was scoped.",
      "Decide whether this is the same workflow or a new requirement.",
      "Update the solution to match the real workflow, not just the requested field.",
    ],
    blocks: false,
    gate: "Not a problem — just confirm it before you move on.",
  },
  testplan: {
    status: "MISSING: NO TEST PLAN",
    actions: [
      "Name who will test it.",
      "Pick a real example for them to use — not a demo.",
      "Agree exactly what “tested” means for this workflow.",
      "Set a date.",
    ],
    blocks: true,
    gate: "Don't leave Kickoff without this agreed — “please test it” isn't a plan.",
  },
  notesting: {
    status: "BLOCKED: CUSTOMER HASN'T TESTED",
    actions: [
      "Pick one real example from their actual work.",
      "Agree who runs it through the workflow and by when.",
      "Walk through it together if that's what it takes to get it done.",
      "Review the result before building anything else.",
    ],
    blocks: true,
    gate: "Don't keep building until a real example has gone through the workflow.",
  },
  changerequest: {
    status: "CUSTOMER IS ASKING FOR CHANGES",
    actions: [
      "Ask what they expected, what happened, and what they need instead.",
      "Check whether this supports the agreed workflow or is something new.",
      "Make the change only if it supports the agreed workflow.",
      "Log anything else as a new request instead of quietly building it in.",
    ],
    blocks: false,
    gate: "A request is information, not an automatic instruction — confirm it before you build it.",
  },
  workflowbroken: {
    status: "BLOCKED: CORE WORKFLOW BROKEN",
    actions: [
      "Find exactly where it breaks.",
      "Understand why it matters to the real process.",
      "Fix it.",
      "Run the same real example through it again.",
    ],
    blocks: true,
    gate: "You're not ready for Make It Yours until the core workflow works end to end.",
  },
  scopecheck: {
    status: "CHECK: IS THIS IN SCOPE?",
    actions: [
      "Check the SOW and purchased scope.",
      "Ask why the customer needs it and what it's for.",
      "Decide: Implementation, Technical Solutions, Support, or new scope.",
      "Confirm ownership before you commit to it.",
    ],
    blocks: false,
    gate: "Don't commit to it until you know who owns it.",
  },
  stilldependent: {
    status: "BLOCKED: CUSTOMER STILL DEPENDS ON YOU",
    actions: [
      "Name the exact thing they can't do without you.",
      "Show them how to do it on their real workflow.",
      "Do it together once.",
      "Have them do it themselves while you watch.",
    ],
    blocks: true,
    gate: "You're not ready for Make It Run until they can run this without you.",
  },
  whattoteach: {
    status: "CLARIFY: WHAT TO TEACH",
    actions: [
      "List what the customer will own after Implementation.",
      "Teach only those actions, using their actual solution.",
      "Skip anything they won't be the one doing.",
      "Confirm they can repeat it without you.",
    ],
    blocks: false,
    gate: "Teach to what they'll own — not a tour of GoCanvas.",
  },
  tsdependency: {
    status: "WAITING: TECHNICAL SOLUTIONS DEPENDENCY",
    actions: [
      "Identify exactly what the engineer needs to be stable first.",
      "Finish that dependency.",
      "Bring in the right Technical Solutions owner once it's stable.",
      "Confirm a date for the handoff.",
    ],
    blocks: false,
    gate: "Don't start the dependent work against a workflow that's still moving.",
  },
  pilotissue: {
    status: "BLOCKED: PILOT ISSUE",
    actions: [
      "Write down exactly what failed.",
      "Decide who owns the fix.",
      "Agree when it will be fixed.",
      "Test that part of the workflow again.",
    ],
    blocks: true,
    gate: "You're not ready for Graduate yet.",
  },
  nousers: {
    status: "BLOCKED: REAL USERS HAVEN'T TESTED IT",
    actions: [
      "Choose the people who will use this after implementation.",
      "Give them a real piece of work to complete in GoCanvas.",
      "Agree when they will do it.",
      "Review what happened with the customer.",
    ],
    blocks: true,
    gate: "You're not ready for Graduate yet.",
  },
  waitingexternal: {
    status: "WAITING: EXTERNAL DEPENDENCY",
    actions: [
      "Name exactly what's blocked.",
      "Confirm who owns it.",
      "Get a committed next date.",
      "Decide whether the dependency prevents the customer from going live.",
    ],
    blocks: true,
    gate: "Do not move on until the dependency is resolved or there is a clear owner, date and agreed path forward.",
  },
  customernotready: {
    status: "BLOCKED: CUSTOMER NOT READY TO ACCEPT",
    actions: [
      "Go back to what you agreed this implementation needed to achieve.",
      "Ask what specifically is stopping them from saying it's ready.",
      "Separate an implementation gap from a future enhancement.",
      "Agree the remaining action, owner and date.",
    ],
    blocks: true,
    gate: "You're not ready for Graduate until the customer agrees the implemented workflow is ready.",
  },
  completedependent: {
    status: "BLOCKED: CUSTOMER STILL RELIES ON YOU",
    actions: [
      "Name the exact thing they can't do without you.",
      "Decide if it's a training gap or a missing capability.",
      "Close the gap, or agree who owns it going forward.",
      "Confirm they can run it without you before you graduate them.",
    ],
    blocks: true,
    gate: "You're not ready for Graduate until they can run this without you.",
  },
  incomplete: {
    status: "DECIDE: DOES THIS BLOCK GRADUATE?",
    actions: [
      "Name exactly what's unfinished.",
      "Decide: does it block the agreed outcome, or is it a transition or new work item?",
      "If it blocks the outcome, finish it before graduating.",
      "If it doesn't, assign it an owner and move on.",
    ],
    blocks: false,
    gate: "Not every open item should keep Implementation open — but a blocking one does.",
  },
  handoff: {
    status: "BLOCKED: NO NEXT OWNER CONFIRMED",
    actions: [
      "Check whether this account has a TAM, AM or Scaled CSM.",
      "Confirm who it is.",
      "Write down what they need to know — open items, risks, context.",
      "Hand it to them directly; don't leave it unassigned.",
    ],
    blocks: true,
    gate: "Graduate shouldn't create an ownership gap — confirm the next owner first.",
  },
  timeline: {
    status: "CHECK: IS THE DATE THE REAL BLOCKER?",
    actions: [
      "Name exactly what's not done yet.",
      "Decide who owns finishing it.",
      "Get the shortest realistic path to the agreed outcome.",
      "Don't graduate just because the calendar says so — and don't stay open without a reason either.",
    ],
    blocks: false,
    gate: "The date is a signal, not the definition of done.",
  },
};

function stuck(entries: ReadonlyArray<{ key: string; label: string }>): StuckPrompt[] {
  return entries.map((e) => ({ ...e, ...ISSUES[e.key]! }));
}

const STAGE_GUIDANCE: Partial<Record<FlowStageKey, StageGuidance>> = {
  kickoff: {
    objective: "Confirm the real process and leave with something to test.",
    objectiveDetail:
      "Walk through how the work actually happens today. Check the starting point against that, and agree who tests it, with what, and by when.",
    checks: [
      "We walked through the real process with the customer, start to finish.",
      "The customer confirmed the starting point fits how they work, or told us what's changing from today.",
      "We agreed who will test it, with what, and by when.",
      "The customer knows exactly what to do next.",
    ],
    stuck: stuck([
      { key: "process", label: "I still don't understand the process" },
      { key: "notready", label: "We arrived without enough to show" },
      { key: "different", label: "The customer wants something different" },
      { key: "testplan", label: "I'm not sure what they should test" },
    ]),
    readyLabel: "Ready for Get It Working when",
    readyWhen: [
      "The real process is understood and agreed.",
      "The customer confirmed the starting point, or told us what's changing.",
      "We know who tests it, with what, and by when.",
      "The customer has a clear next action.",
    ],
    next: "Get It Working",
  },
  get_it_working: {
    objective: "Get the core workflow working end to end, with a real example.",
    objectiveDetail:
      "Run the customer's actual work through the solution from start to finish, fix what breaks, and understand why before building around every request.",
    checks: [
      "The customer has run a real example through the workflow, not a demo.",
      "The core workflow works from start to finish.",
      "We know why each requested change is actually needed.",
      "Important workflow decisions are written down.",
      "The foundation is stable enough to build on.",
    ],
    stuck: stuck([
      { key: "notesting", label: "The customer hasn't tested" },
      { key: "changerequest", label: "They keep asking for changes" },
      { key: "workflowbroken", label: "The workflow isn't working" },
      { key: "scopecheck", label: "I'm not sure if this is scope" },
    ]),
    readyLabel: "Ready for Make It Yours when",
    readyWhen: [
      "A real example has run through the workflow end to end.",
      "The core workflow works, start to finish.",
      "Requested changes are understood, not just applied.",
      "The foundation is stable enough to build on.",
    ],
    next: "Make It Yours",
  },
  make_it_yours: {
    objective: "Finish fitting the solution to how the customer actually works.",
    objectiveDetail:
      "Build out what's left against their real process and purchased scope, and teach them the parts they'll own — show it, do it together, then have them do it.",
    checks: [
      "The core workflow is still stable.",
      "We're only teaching what they need for their own workflow.",
      "The customer owner can do the parts they're expected to own.",
      "Technical Solutions work has started where its dependency is ready.",
      "What's left is tied to the agreed outcome, not an open wish list.",
    ],
    stuck: stuck([
      { key: "stilldependent", label: "They still depend on me for everything" },
      { key: "whattoteach", label: "I don't know what to teach" },
      { key: "tsdependency", label: "Technical Solutions isn't ready" },
      { key: "scopecheck", label: "A new request has appeared" },
    ]),
    readyLabel: "Ready for Make It Run when",
    readyWhen: [
      "The solution matches the agreed workflow and purchased scope.",
      "The customer can operate the parts they're expected to own.",
      "Technical Solutions work is on track or complete.",
      "Nothing left is still an open wish list.",
    ],
    next: "Make It Run",
  },
  make_it_run: {
    objective: "Get the customer to run the workflow for real.",
    objectiveDetail:
      "Pick real users and real work. Have them complete the process from start to finish, then confirm what worked and what still needs fixing.",
    checks: [
      "Real users completed the workflow.",
      "They used real work, not a demo.",
      "Forms, integrations and outputs worked as expected.",
      "Anything still outstanding has an owner and next step.",
      "The customer agrees the workflow is ready to use.",
    ],
    stuck: stuck([
      { key: "pilotissue", label: "The pilot found a problem" },
      { key: "nousers", label: "Users aren't actually using it" },
      { key: "waitingexternal", label: "We're waiting on another team" },
      { key: "customernotready", label: "The customer won't confirm they're ready" },
    ]),
    readyLabel: "Ready for Graduate when",
    readyWhen: [
      "Real users have used it.",
      "The agreed workflow works.",
      "Remaining issues have an owner and plan.",
      "The customer agrees they're ready.",
    ],
    next: "Graduate",
  },
  complete: {
    objective: "Confirm the implementation is actually done, and hand off ownership.",
    objectiveDetail:
      "Check the workflow works without you, everything purchased is finished or transitioned, and someone else knows what happens next.",
    checks: [
      "The agreed workflow works end to end.",
      "Real users or real work showed it works, not just a walkthrough.",
      "The customer can run it without depending on Implementation.",
      "Purchased components are finished or handed to the right owner.",
      "The customer knows where to go next.",
      "Final status and ownership are written down.",
    ],
    stuck: stuck([
      { key: "completedependent", label: "They still rely on Implementation" },
      { key: "incomplete", label: "Something is still incomplete" },
      { key: "handoff", label: "I don't know who owns them next" },
      { key: "timeline", label: "The timeline ended but we're not done" },
    ]),
    readyLabel: "Ready to close out when",
    readyWhen: [
      "The customer can run it without Implementation.",
      "Purchased work is finished or handed off.",
      "Nothing left blocks the agreed outcome.",
      "The next owner is confirmed.",
    ],
    next: "TAM · AM · Scaled CSM",
  },
};

/** Stage guidance for a canonical stage, or null when none exists (yet). */
export function stageGuidanceFor(key: FlowStageKey): StageGuidance | null {
  return STAGE_GUIDANCE[key] ?? null;
}
