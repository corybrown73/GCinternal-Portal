import type { FlowStageKey } from "./stage-flow";

/**
 * Static guidance from the TIS Project Navigator
 * (GoCanvas_TIS_Project_Navigator_v2.html), word for word.
 *
 * Read-only content: nothing here is tracked state. The Hub's own tasks and
 * gates (stage-flow.ts) remain the source of truth for what is actually
 * done. This only covers the stages the Navigator covers — Kickoff through
 * Graduate; a stage with no entry here (Prospect, Closed Won, Intake &
 * Process) simply has no Navigator guidance yet.
 */

export type StuckPrompt = {
  key: string;
  label: string;
  title: string;
  why: string;
  action: string;
};

export type StageGuidance = {
  purpose: string;
  checks: readonly string[];
  stuck: readonly StuckPrompt[];
  remember: string;
  readyWhen: string;
  next: string;
};

const ISSUES: Record<string, { title: string; why: string; action: string }> = {
  process: {
    title: "Understand the process before you build more.",
    why: "Go back to the real work. Ask them to walk you through the last time someone did it.",
    action:
      "Follow how it starts, what happens, exceptions, where the information goes, and who owns the outcome.",
  },
  notready: {
    title: "Reset before pretending you’re further along.",
    why: "Kickoff works best when you arrive with something tangible.",
    action:
      "Identify the missing information, get it, then prepare the smallest useful starting point.",
  },
  different: {
    title: "Understand why before changing it.",
    why: "A difference between what was prepared and what the customer needs is useful discovery.",
    action:
      "Ask: “What happens because of this information?” Then change the solution based on the workflow, not just the requested field.",
  },
  testplan: {
    title: "Make the test specific.",
    why: "“Please test it” is too vague.",
    action: "Agree: who tests + what workflow + which real example + by when.",
  },
  notesting: {
    title: "Stop building around untested assumptions.",
    why: "More changes may just create more rework.",
    action: "Agree exactly who will test what, using which real example, and by what date.",
  },
  changes: {
    title: "Separate feedback from solution design.",
    why: "A customer request is information, not automatically an instruction.",
    action:
      "Ask what they expected, what happened, and what needs to happen next. Then decide whether the change supports the agreed workflow.",
  },
  broken: {
    title: "Stay in Get It Working.",
    why: "If the core workflow does not work end to end, you are not ready to move forward.",
    action: "Find the break, understand why it matters, refine it, then test again.",
  },
  scope: {
    title: "Pause before quietly adding it.",
    why: "A new request may be Implementation, purchased Technical Solutions, Support, post-Implementation ownership, or new scope.",
    action:
      "Check the SOW/purchased scope and why the request is needed. Resolve ownership before committing.",
  },
  dependent: {
    title: "Build customer capability, not TIS dependency.",
    why: "If the customer needs you to operate something they should own, the implementation is not creating independence.",
    action:
      "Identify the exact capability gap. Teach it in their real workflow, do it together, then have them do it.",
  },
  teach: {
    title: "Teach only what helps them run their workflow.",
    why: "The customer does not need a tour of GoCanvas.",
    action:
      "Start with what they will own after Implementation and teach those actions using their actual solution.",
  },
  ts: {
    title: "Check the dependency, not the calendar.",
    why: "Technical Solutions can run in parallel, but dependent work should not start against a moving core workflow.",
    action:
      "Identify what the engineer needs to be stable. Finish that dependency, then bring in the appropriate Technical Solutions owner.",
  },
  pilotproblem: {
    title: "Good. The pilot found it before Graduation.",
    why: "A pilot problem tells you what still prevents the workflow from operating properly.",
    action:
      "Name the issue, owner and next action. Resolve or appropriately transition it, then validate again.",
  },
  nousers: {
    title: "You have not proven Make It Run yet.",
    why: "Testing by the project owner does not prove the workflow works for the people who will actually use it.",
    action:
      "Choose real users and real work. Agree what they will run and when you will review the result.",
  },
  waiting: {
    title: "Make the dependency visible.",
    why: "Waiting is sometimes legitimate. The owner, dependency and impact need to be clear.",
    action:
      "Record who owns the next action, what you are waiting for, and what can continue while you wait.",
  },
  acceptance: {
    title: "Make ‘working’ concrete.",
    why: "Customers can struggle to confirm a vague sign-off.",
    action:
      "Return to the agreed success criteria. Confirm what works, what remains, and whether the agreed workflow is ready to operate.",
  },
  incomplete: {
    title: "Decide whether it blocks Graduation.",
    why: "Not every open item should keep Implementation alive forever.",
    action:
      "Classify it: blocking outcome, appropriate transition, or new work. Then assign the correct owner.",
  },
  handoff: {
    title: "Choose the owner based on what happens next.",
    why: "Graduation should not create an ownership vacuum.",
    action: "Confirm the appropriate TAM, AM or Scaled CSM and document what they need to know.",
  },
  timeline: {
    title: "The date is a signal, not the definition of done.",
    why: "Do not Graduate just because the timeline ended. Do not keep it open without a clear reason either.",
    action:
      "Identify exactly what prevents Graduation, who owns it, and the shortest path to the agreed outcome.",
  },
};

function stuck(entries: ReadonlyArray<{ key: string; label: string }>): StuckPrompt[] {
  return entries.map((e) => ({ ...e, ...ISSUES[e.key]! }));
}

const STAGE_GUIDANCE: Partial<Record<FlowStageKey, StageGuidance>> = {
  kickoff: {
    purpose:
      "Validate the customer’s process and the solution or workflow you’re working on. The customer should leave with something real to test.",
    checks: [
      "We understand the real process, not just the requested form.",
      "For a new customer, we validated the prepared starting solution. For an existing customer, we understand what is changing and what should stay.",
      "We know who will test it and what they will test.",
      "The customer has a clear next action and date.",
    ],
    stuck: stuck([
      { key: "process", label: "I still don’t understand the process" },
      { key: "notready", label: "We arrived without enough to show" },
      { key: "different", label: "The customer wants something different" },
      { key: "testplan", label: "I’m not sure what they should test" },
    ]),
    remember:
      "Kickoff should not become a blank-page requirements session. If you did not have enough information to prepare something tangible, that gap should have been handled before Kickoff.",
    readyWhen:
      "The process and starting point are agreed, and the customer has something real to test.",
    next: "02 · Get It Working",
  },
  get_it_working: {
    purpose:
      "Prove the core workflow works end to end using realistic examples. Understand why before you build around every request.",
    checks: [
      "The customer has tested using a real example.",
      "The core workflow works from start to finish.",
      "We understand why requested changes are needed.",
      "Important workflow decisions are documented.",
      "The foundation is becoming stable enough to build around.",
    ],
    stuck: stuck([
      { key: "notesting", label: "The customer hasn’t tested" },
      { key: "changes", label: "They keep asking for changes" },
      { key: "broken", label: "The workflow isn’t working" },
      { key: "scope", label: "I’m not sure if this is scope" },
    ]),
    remember:
      "More building is not always the next move. If the customer has not tested what is already there, get a real example through the workflow first.",
    readyWhen:
      "The customer has tested the core workflow and it works end to end. The foundation is stable enough to build around.",
    next: "03 · Make It Yours",
  },
  make_it_yours: {
    purpose:
      "Complete the solution around the customer’s actual workflow and purchased scope, while building the capability they need to run it.",
    checks: [
      "The core workflow is stable.",
      "We are only teaching capabilities relevant to their workflow.",
      "The customer owner knows how to manage what they should own.",
      "Purchased Technical Solutions work has started when the relevant workflow is ready.",
      "Remaining work is tied to the agreed outcome, not an open wish list.",
    ],
    stuck: stuck([
      { key: "dependent", label: "They still depend on me for everything" },
      { key: "teach", label: "I don’t know what to teach" },
      { key: "ts", label: "Technical Solutions isn’t ready" },
      { key: "scope", label: "A new request has appeared" },
    ]),
    remember:
      "This is not a feature tour. Teach against the customer’s real workflow. Show it, do it together, then have them do it.",
    readyWhen:
      "The solution reflects the agreed workflow and purchased scope, and the customer can operate the parts they are expected to own.",
    next: "04 · Make It Run",
  },
  make_it_run: {
    purpose:
      "Prove the complete workflow with real users and real work. Refine what remains and get customer acceptance.",
    checks: [
      "Real users have used the workflow.",
      "The pilot used realistic work, not a demo scenario.",
      "Relevant outputs and purchased components work as expected.",
      "Remaining issues have a clear owner and next action.",
      "The customer can say whether the agreed outcome works.",
    ],
    stuck: stuck([
      { key: "pilotproblem", label: "The pilot found a problem" },
      { key: "nousers", label: "Users aren’t actually using it" },
      { key: "waiting", label: "We’re waiting on another team" },
      { key: "acceptance", label: "The customer won’t confirm acceptance" },
    ]),
    remember:
      "A working build is not the same as an operational workflow. The pilot proves it can work outside the Implementation call.",
    readyWhen:
      "The complete workflow has been proven in real use, important issues are resolved or appropriately owned, and the customer accepts the outcome.",
    next: "05 · Graduate",
  },
  complete: {
    purpose:
      "Confirm the solution works, the customer can operate it without depending on Implementation, and ongoing ownership is clear.",
    checks: [
      "The agreed workflow works end to end.",
      "It has been proven with real users or real work.",
      "The customer can operate what they need without depending on Implementation.",
      "Purchased components are complete or appropriately transitioned.",
      "The customer knows where to go next.",
      "Final status and ownership are documented.",
    ],
    stuck: stuck([
      { key: "dependent", label: "They still rely on Implementation" },
      { key: "incomplete", label: "Something is still incomplete" },
      { key: "handoff", label: "I don’t know who owns them next" },
      { key: "timeline", label: "The timeline ended but we’re not done" },
    ]),
    remember:
      "Thirty days passing does not mean the implementation is complete. Equally, Implementation should not become permanent ownership once the agreed outcome is achieved.",
    readyWhen:
      "The customer is operational and independent enough to leave Implementation. Graduation is based on outcome, not the calendar.",
    next: "TAM · AM · Scaled CSM",
  },
};

/** Navigator guidance for a stage, or null when the Navigator does not cover it (yet). */
export function stageGuidanceFor(key: FlowStageKey): StageGuidance | null {
  return STAGE_GUIDANCE[key] ?? null;
}
