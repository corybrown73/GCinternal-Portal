import { shortDay } from "./onboarding-timeline";
import type { WelcomeView } from "./welcome";

/**
 * The talk track for the first call.
 *
 * WHY THIS EXISTS. The welcome page is what the customer sees. This is what
 * the person presenting it says — screen by screen, with the argument for
 * why we do it this way, and the answers to the things customers push back
 * on. Fifteen years of onboarding says the seven-day form, the homework,
 * the customer's hands on the keyboard and the gated integration are what
 * gets value fast. Every rep should be able to make that case the same way,
 * so the case is written down once and rendered with this customer's dates
 * and names in it.
 *
 * Pure: the same view the page renders, no extra loads.
 */

export type NoteSection = {
  screen: number;
  title: string;
  /** What to say, in order. Short lines a presenter can glance at. */
  say: string[];
  /** The conviction behind it — why we do it this way. */
  why: string;
  /** Objections, and the answer we give. */
  ifTheyAsk: Array<{ q: string; a: string }>;
};

export function speakerNotes(view: WelcomeView): {
  headline: string;
  opener: string[];
  sections: NoteSection[];
  close: string[];
} {
  const t = view.timeline;
  const at = (key: string) => t.milestones.find((m) => m.key === key);
  const kickoff = at("kickoff");
  const homework = at("homework");
  const working = at("working");
  const fieldtest = at("fieldtest");
  const integ = t.integration;
  const form = view.firstForm?.name ?? "the first form";
  const tester = view.fieldTester ?? "your field tester";
  const champion = view.team.champion?.name ?? "your project owner";
  const lead = view.team.lead ?? "your onboarding lead";
  const live = shortDay(t.liveDate);

  return {
    headline: `${view.clientName} — the first call`,
    opener: [
      `Thanks for the time. This is a short one: six screens, and you leave knowing exactly what happens on which day and who does it.`,
      `One thing up front. We have been onboarding field teams for over fifteen years. What is on these screens is not a proposal — it is the way we do it, because it is what gets a crew real value fast. Where a date does not work for you, we move the date. The shape stays.`,
    ],
    sections: [
      {
        screen: 1,
        title: "Let's bring your workflow to life",
        say: [
          `Welcome aboard as of ${shortDay(t.closeDate)}. Your first form is in the field by ${live}.`,
          `That phone on the right is ${form} — yours, not a demo. It is what your crew will be holding on ${live}.`,
        ],
        why: "Say the live date in the first thirty seconds. Every account that stalled, stalled because nobody named a date on the first call.",
        ifTheyAsk: [
          {
            q: "That's fast. Is that realistic?",
            a: "It is the normal pace. One form, one crew, real jobs. Everything else waits until this one is proven — that is why it is fast.",
          },
        ],
      },
      {
        screen: 2,
        title: "Your team",
        say: [
          `${lead} runs both calls and builds with you. ${champion} owns the plan on your side and makes the last changes to the form in the working session.`,
          `${tester} is the most important name on this page: one crew, real jobs, from ${fieldtest ? shortDay(fieldtest.date) : "the field test"}. What they say is what we fix.`,
          "Questions go to a person, by name. There is no ticket queue between you and us in the first seven days.",
        ],
        why: "Two names on the customer side, agreed on the first call, is the difference between a plan and a wish. Get the field tester named before leaving this screen.",
        ifTheyAsk: [
          {
            q: "We don't have a field tester yet.",
            a: `Pick the crew lead who complains loudest about the paper. Have a name to us by ${homework ? shortDay(homework.date) : "the homework date"} — it is one of the three homework items.`,
          },
        ],
      },
      {
        screen: 3,
        title: "Your timeline",
        say: [
          `Walk it left to right and say the dates out loud. Kickoff ${kickoff ? shortDay(kickoff.date) : ""}, sixty minutes. Homework due ${homework ? shortDay(homework.date) : ""}. Working session ${working ? shortDay(working.date) : ""}, thirty minutes. Field test from ${fieldtest ? shortDay(fieldtest.date) : ""}. Live ${live}.`,
          "Every step has an owner. Blue is on a call together; green is your homework; navy is ours.",
          ...t.alongside.map(
            (svc) =>
              `Alongside the form, from the kickoff call: ${svc.name} (${svc.label.toLowerCase()}, ${svc.weeks} wk${svc.weeks === 1 ? "" : "s"}, live ${shortDay(svc.endsOn)}). What we need from you: ${svc.needs.replace(/\.$/, "")}. Ask for it now.`,
          ),
          ...(t.phases.length
            ? [
                "What comes after the form is on the next screen. Do not get pulled into it here — this screen is the seven days.",
              ]
            : []),
        ],
        why: "Book both calls before you leave this screen. A date that is on the calendar is a date; a date that is on a slide is a hope. If one does not work, move it now in the portal — the page updates in front of them.",
        ifTheyAsk: [
          {
            q: "Can we do the integration at the same time as the form?",
            a: "No, and it is the one thing we hold on. An integration is field mapping, and the mapping cannot be right until a crew has run the form on real jobs. Two weeks of real submissions is what makes it right. Remapping an integration costs more than the two weeks.",
          },
          {
            q: "Can the working session be longer?",
            a: "Thirty minutes with your hands on the keyboard beats two hours watching ours. If we need more, we book a second thirty.",
          },
        ],
      },
      ...(t.phases.length
        ? [
            {
              screen: 4,
              title: "After the form — the full picture",
              say: [
                `Say "you are on phase 1" out loud, then walk the map: ${t.phases.map((ph) => `${ph.label.toLowerCase()} is ${ph.services.map((x) => x.name).join(" and ")}${ph.services.length > 1 ? ", worked on at the same time" : ""}`).join("; ")}.`,
                ...t.phases.map(
                  (ph) =>
                    `${ph.label}: ${ph.gate.toLowerCase()}. ${ph.tentative ? `The earliest that could be is ${shortDay(ph.startsOn!)}; the dates are marked as estimates for that reason.` : `That happened, so it runs ${shortDay(ph.startsOn!)} to ${shortDay(ph.endsOn!)}.`}`,
                ),
                "Each one opens with its own thirty-minute kickoff to gather the final details — the ones we could not know until the form was real.",
              ],
              why: "Customers with an integration on the order want to talk about the integration. This screen lets them see it is planned, dated and gated, so the conversation can go back to the form.",
              ifTheyAsk: [
                {
                  q: "Why can't the PDF start now? It's not an integration.",
                  a: "Because it is built from real submissions — the layout is proven on real data, not on our guess of what a ticket looks like. One week after the form is live, it is right first time.",
                },
              ],
            },
          ]
        : []),
      {
        screen: t.phases.length ? 5 : 4,
        title: "What's expected",
        say: [
          "We build it with you, not for you. A form you built yourself is one you will change yourself — and the second use case shows up on its own.",
          `Three homework items before the working session, due ${homework ? shortDay(homework.date) : ""}: download the app and log in, add one field user who will test on a real job, send us the customer or site list.`,
          "Fifteen minutes. It means the working session starts from a live account instead of a blank one.",
          ...t.alongside.map((svc) => `And for ${svc.name}: ${svc.needs}`),
        ],
        why: "This screen changes the relationship. The customer who gets a form handed to them comes back with a support ticket. The customer who built it comes back with the next use case. Say it plainly and assign the three items to a named person.",
        ifTheyAsk: [
          {
            q: "Can't you just build it and send it over?",
            a: "We could, and we used to. Those accounts churned. The form is yours to run for years; thirty minutes with your hands on it is the cheapest insurance you will buy.",
          },
        ],
      },
      {
        screen: t.phases.length ? 6 : 5,
        title: "How we get there — now and the future",
        say: [
          view.currentProcess
            ? `Today, in your words: "${view.currentProcess}"`
            : "Today: paper on the truck, photos on somebody's phone, the office retyping it all on Friday.",
          `By ${live}: ${form} on the crew's phone. Same day in the office, photos and a signature on every one, no retyping.`,
          t.phases.length
            ? `Then the rest of the order, once the form is dialed in. Do not list it here — it has its own screen${t.phases.length > 1 ? "s" : ""}, and the customer has already seen ${t.phases.length > 1 ? "them" : "it"}.`
            : `Then the next forms — ${view.nextUseCases.map((n) => n.name).join(", ") || "the ones you pick"} — built by you, with us on a call if you want us.`,
        ],
        why: "The customer's own words on the 'today' side is what makes this land. If the intake did not capture them, ask now and type it into the portal after the call.",
        ifTheyAsk: [
          {
            q: "What if the form from the library isn't quite right?",
            a: "It is a starting point, not the finished form. Tell us what is missing on the kickoff call and we build it in live. By the working session it is yours.",
          },
        ],
      },
      {
        screen: t.phases.length ? 7 : 6,
        title: "Let's get into business",
        say: [
          `Two calls: kickoff ${kickoff ? shortDay(kickoff.date) : ""}, working session ${working ? shortDay(working.date) : ""}. Then it is yours.`,
          `What good looks like on ${live}: the crew submits from the phone, the office sees it the same day, and a change the crew asked for was made the same day.`,
          `Your next step: accept the kickoff invite for ${kickoff ? shortDay(kickoff.date) : "day one"} and download the app.`,
        ],
        why: "End on the one thing they do next. Not three things. One.",
        ifTheyAsk: [
          {
            q: "Who do we call if something breaks?",
            a: `${lead}, directly, by name. After the live date the same team runs the working-session format for every form you add.`,
          },
        ],
      },
    ],
    close: [
      `Send the customer their link right after the call. It has the dates, their homework as checkboxes, and it updates when a date moves.`,
      `Book both calls before you hang up. Confirm the field tester's name. Then start the clock.`,
    ],
  };
}
