export type PresenterGuide = {
  objective: string;
  opening: string;
  questions: string[];
  capture: string;
  ready: string;
};

/** One guide per customer-facing slide, in slide order. Plain language, for a live call. */
export const PRESENTER_GUIDES: Record<1 | 2 | 3 | 4 | 5 | 6, PresenterGuide> = {
  1: {
    objective: "Confirm the outcome they are buying and the first form we build for it.",
    opening: "What should be different for your team a month after go-live?",
    questions: [
      "What is the one job this has to do first?",
      "Which form or workflow do you want working first?",
      "How will you know it worked?",
    ],
    capture: "The outcome in their words, how they will measure it, and the first form's name.",
    ready: "The outcome and the first form are in their words, and they agree with both.",
  },
  2: {
    objective: "Agree how the work runs today: before the job, during it, and after it.",
    opening: "Walk me through one job from start to finish, the way your crew does it today.",
    questions: [
      "What has to be true before someone starts the job?",
      "Where does the information go once it is submitted?",
      "What about this is still unclear to you?",
    ],
    capture: "One line each for before, during and after, and every open question by name.",
    ready: "All three parts are in their words, and no open question blocks the first form.",
  },
  3: {
    objective: "Agree the four stage targets, and record any change with its reason.",
    opening: "These are the dates we work to after kickoff. Which of them are already fixed?",
    questions: [
      "Which target is fixed by something outside this project?",
      "If a date moves, is the cause on your side, ours, or both?",
      "Who needs to hear about a change before it is saved?",
    ],
    capture:
      "Each target's current date, the baseline it started from, and a reason for each change.",
    ready:
      "Every target has a current date, and every change since the baseline has a reason and a category.",
  },
  4: {
    objective:
      "Agree who decides, who maintains the forms, how we communicate, and what happens when work slips or scope changes.",
    opening:
      "Let's agree how we work together. We each own certain things, so let's name them before we start.",
    questions: [
      "Who makes the call when we disagree on scope or timing?",
      "How do you want updates: a weekly note, a call, or only when something changes?",
      "If a response from either side is late, who do we escalate to, and when?",
    ],
    capture:
      "Named people for decisions, form upkeep and day-to-day contact. Mutual accountability: what we owe and what they owe. The update rhythm. How delays and scope changes are raised.",
    ready:
      "Decision-maker, form maintainer and day-to-day contact are named, and both sides agree how delays and scope changes are raised. Quote a response term only after checking the signed agreement.",
  },
  5: {
    objective:
      "Confirm the live form, what must change before the real-job test, and who owns each change.",
    opening: "Let's open the live form and walk the first screen together.",
    questions: [
      "Which changes must land before the real-job test?",
      "Who on your side owns each one?",
      "What does the tester need in place: the job, the device and the feedback route?",
    ],
    capture: "The editable GoCanvas link, each open change with an owner and a target date.",
    ready: "The form link is saved, and every open change has an owner and a target.",
  },
  6: {
    objective: "Leave with dated sessions, a named tester and a confirmed first scope.",
    opening: "Before we close, let's put the next three working sessions in the diary.",
    questions: [
      "Which session can you hold in the next week?",
      "Who tests the form, and when can they do it?",
      "Is anything in the first scope different from what you expected?",
    ],
    capture:
      "Booked sessions, the tester and their deadline, and the first scope confirmed or its gap named.",
    ready:
      "The next session is booked or its date agreed, the tester and deadline are set, and the first scope is confirmed.",
  },
};

export const PRESENTER_SECTIONS: ReadonlyArray<{
  n: 1 | 2 | 3 | 4 | 5 | 6;
  title: string;
  short: string;
}> = [
  { n: 1, title: "Welcome", short: "Welcome" },
  { n: 2, title: "Your workflow", short: "Workflow" },
  { n: 3, title: "Implementation journey", short: "Journey" },
  { n: 4, title: "How we'll keep things moving", short: "Keep moving" },
  { n: 5, title: "Form V1", short: "Form V1" },
  { n: 6, title: "Your next move", short: "Next move" },
];
