import type { BriefJson } from "./server/schemas";

/**
 * What the kickoff and handoff deck says, decided here.
 *
 * PURE ON PURPOSE. This module chooses the deck's sections and their contents
 * from what a deal actually recorded; `src/lib/server/brief/pptx.ts` draws
 * them. Splitting it that way is what makes "does the SOW slide appear when
 * there is no SOW?" a question with a test rather than a question with a
 * PowerPoint file.
 *
 * IT NAMES WHAT IS MISSING. A deck is read in a room, and the room is the last
 * chance to catch that nobody wrote down the SOW or that no call notes were
 * ever uploaded. A section with nothing behind it therefore stays and says so,
 * in the words a person would use — the same rule the completion record
 * follows. Silence would let the handoff meeting end without anyone noticing.
 *
 * NOTHING IS INVENTED. Every line traces to something a person recorded: a
 * Gong report, the deal record, the SOW fields, the brief the LLM produced
 * from those reports. There are no scores and no verdicts on the deal.
 */

export type DeckSow = {
  reference: string | null;
  signedDate: string | null;
  value: number | null;
  documentName: string | null;
  documentUrl: string | null;
};

export type DeckAccount = {
  name: string;
  domain: string | null;
  arr: number | null;
  products: string[] | null;
  primaryContactName: string | null;
  primaryContactEmail: string | null;
  primaryContactRole: string | null;
  salesOwner: string | null;
  seOwner: string | null;
};

export type DeckSource = {
  title: string;
  reportType: string;
  createdAt: string;
};

/** Someone on the GoCanvas side, and what they are here to do. */
export type DeckPerson = {
  name: string;
  role: string;
};

/** One stage of the plan the project will actually run. */
export type DeckStage = {
  name: string;
  /** The template's own words for what this stage is for. */
  intent: string | null;
  targetDays: number | null;
};

/**
 * The plan, if a project exists yet.
 *
 * A deck generated the day a deal closes has none, and one generated after
 * handoff has the real thing. Nullable rather than optional, so the deck has
 * to decide what to say when there is none instead of quietly dropping a
 * section the room was expecting.
 */
export type DeckPlanOfWork = {
  implementationName: string;
  targetLaunchDate: string | null;
  stages: DeckStage[];
  /** The first things that are on the customer, not on us. */
  firstCustomerTasks: Array<{ title: string; stage: string }>;
  /** Where they will track it, once they have a link. */
  planUrl: string | null;
};

export type KickoffDeckInput = {
  brief: BriefJson;
  account: DeckAccount;
  sow: DeckSow | null;
  /** The Gong reports the brief was generated from. Provenance, not decoration. */
  sources: DeckSource[];
  /**
   * The GoCanvas people the customer is about to work with. The single most
   * important fact in a handoff deck and the one the brief cannot know: the
   * customer met sales, and is about to work with somebody else entirely.
   */
  team: DeckPerson[];
  /** The plan, if the project exists yet. */
  plan: DeckPlanOfWork | null;
  preparedAt: string;
};

export type DeckBullets = { kind: "bullets"; items: string[] };
export type DeckPairs = { kind: "pairs"; items: Array<[string, string]> };
export type DeckTable = { kind: "table"; header: string[]; rows: string[][] };
export type DeckProse = { kind: "prose"; text: string };
/** A section whose data nobody recorded. Rendered, not skipped. */
export type DeckAbsent = { kind: "absent"; note: string };

export type DeckBody = DeckBullets | DeckPairs | DeckTable | DeckProse | DeckAbsent;

export type DeckSlide = {
  /** A full-bleed navy divider. The template opens each act with one. */
  divider?: boolean;
  title: string;
  subtitle?: string | null;
  body?: DeckBody;
};

export type DeckPlan = {
  accountName: string;
  preparedAt: string;
  /** The acts, for the agenda slide. Only the ones that made it in. */
  agenda: string[];
  slides: DeckSlide[];
};

const money = (v: number | null) =>
  v == null ? null : `$${Math.round(v).toLocaleString("en-US")}`;

const clean = (v: string | null | undefined) => {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
};

const dash = (v: string | null) => v ?? "—";

/** Long free text is unreadable at slide size; this cuts on a word boundary. */
export function fit(text: string, max: number): string {
  const t = text.trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const at = cut.lastIndexOf(" ");
  return `${cut.slice(0, at > max * 0.6 ? at : max)}…`;
}

const REPORT_TYPE_LABEL: Record<string, string> = {
  call_notes: "Call notes",
  account_map: "Account map",
};

export function buildKickoffDeck(input: KickoffDeckInput): DeckPlan {
  const { brief, account, sow, sources } = input;
  const slides: DeckSlide[] = [];
  const agenda: string[] = [];

  const act = (title: string, subtitle?: string) => {
    agenda.push(title);
    slides.push({ divider: true, title, subtitle: subtitle ?? null });
  };

  /* ---------------------------------------------------------- the account */

  act("The account", "Who they are and what they bought");

  const glance: Array<[string, string]> = [
    ["Account", account.name],
    ["Domain", dash(clean(account.domain))],
    ["Annual value", dash(money(account.arr))],
    ["Products", account.products?.length ? account.products.join(", ") : "—"],
    ["Main contact", dash(clean(account.primaryContactName))],
    ["Their role", dash(clean(account.primaryContactRole))],
    ["Sold by", dash(clean(account.salesOwner))],
    ["Solutions engineer", dash(clean(account.seOwner))],
  ];
  slides.push({
    title: "At a glance",
    subtitle: "As recorded on the deal",
    body: { kind: "pairs", items: glance },
  });

  slides.push({
    title: "Who's in the room",
    subtitle: "And who owns what",
    body: brief.stakeholders.length
      ? {
          kind: "table",
          header: ["Name", "Role", "Notes"],
          rows: brief.stakeholders.map((s) => [s.name, s.role, fit(s.notes, 140)]),
        }
      : {
          kind: "absent",
          note: "No stakeholders were recorded on this deal. Before the kickoff, somebody needs to say who the sponsor is and who signs things off.",
        },
  });

  /* ------------------------------------------------------- what we heard */

  act("What we heard", "From the calls, in their words");

  slides.push({
    title: "The short version",
    body: clean(brief.one_liner)
      ? { kind: "prose", text: brief.one_liner }
      : { kind: "absent", note: "No summary was produced for this account." },
  });

  slides.push({
    title: "Why they bought",
    body: brief.goals.length
      ? { kind: "bullets", items: brief.goals.map((g) => fit(g, 200)) }
      : {
          kind: "absent",
          note: "No goals were captured. Implementation is about to build against a target nobody wrote down.",
        },
  });

  slides.push({
    title: "What we know today",
    body: brief.what_we_know.length
      ? {
          kind: "table",
          header: ["Topic", "Detail"],
          rows: brief.what_we_know.map((w) => [w.topic, fit(w.detail, 220)]),
        }
      : { kind: "absent", note: "Nothing was captured beyond the summary above." },
  });

  for (const section of brief.current_process) {
    slides.push({
      title: "How they work today",
      subtitle: section.title,
      body: { kind: "bullets", items: section.bullets.map((b) => fit(b, 200)) },
    });
  }
  if (brief.current_process.length === 0) {
    slides.push({
      title: "How they work today",
      body: {
        kind: "absent",
        note: "The as-is process was never written down, so onboarding will have to run discovery again.",
      },
    });
  }

  slides.push({
    title: "Where it breaks",
    subtitle: "The gaps this project exists to close",
    body: brief.process_gaps.length
      ? { kind: "bullets", items: brief.process_gaps.map((g) => fit(g, 200)) }
      : { kind: "absent", note: "No process gaps were recorded." },
  });

  slides.push({
    title: "Where this came from",
    subtitle: "The calls behind everything above",
    body: sources.length
      ? {
          kind: "table",
          header: ["Source", "Kind", "Added"],
          rows: sources.map((s) => [
            s.title,
            REPORT_TYPE_LABEL[s.reportType] ?? s.reportType,
            s.createdAt.slice(0, 10),
          ]),
        }
      : {
          kind: "absent",
          note: "This deck was built without a single call note. Treat everything in it as unverified.",
        },
  });

  /* --------------------------------------------------------- what we sold */

  act("What we sold", "The statement of work");

  const hasSow =
    sow != null &&
    (clean(sow.reference) || sow.signedDate || sow.value != null || clean(sow.documentUrl));

  slides.push({
    title: "The SOW",
    body: hasSow
      ? {
          kind: "pairs",
          items: [
            ["Reference", dash(clean(sow!.reference))],
            ["Signed", dash(clean(sow!.signedDate))],
            ["Value", dash(money(sow!.value))],
            ["Document", dash(clean(sow!.documentName) ?? clean(sow!.documentUrl))],
          ],
        }
      : {
          kind: "absent",
          note: "No SOW is recorded on this deal. Implementation is being asked to deliver a scope nobody has attached — get the reference and the signed document onto the deal before kickoff.",
        },
  });

  /* ----------------------------------------------------- working together */

  act("Working together", "Who takes it from here, and what happens next");

  slides.push({
    title: "Your GoCanvas team",
    subtitle: "From today",
    body: input.team.length
      ? {
          kind: "table",
          header: ["Name", "What they do"],
          rows: input.team.map((p) => [p.name, p.role]),
        }
      : {
          kind: "absent",
          note: "Nobody is assigned on the GoCanvas side. The customer is being handed to a team that does not exist yet — assign an implementation lead before this meeting.",
        },
  });

  const plan = input.plan;

  slides.push({
    title: "The plan",
    subtitle: plan?.targetLaunchDate ? `Target launch ${plan.targetLaunchDate}` : null,
    body: plan
      ? plan.stages.length
        ? {
            kind: "table",
            header: ["Stage", "What happens", "Typical length"],
            rows: plan.stages.map((st) => [
              st.name,
              fit(st.intent ?? "—", 160),
              st.targetDays ? `${st.targetDays} days` : "—",
            ]),
          }
        : {
            kind: "absent",
            note: "The project exists but has no plan attached, so there are no stages to show. Apply a journey template before the kickoff.",
          }
      : {
          kind: "absent",
          note: "No project has been created for this account yet, so there is no plan to show. Start onboarding from the deal and this slide fills itself in.",
        },
  });

  slides.push({
    title: "What we need from you first",
    subtitle: "Before we can start building",
    body: plan
      ? plan.firstCustomerTasks.length
        ? {
            kind: "table",
            header: ["What we need", "By which stage"],
            rows: plan.firstCustomerTasks.map((t) => [t.title, t.stage]),
          }
        : {
            kind: "absent",
            note: "Nothing on this plan is assigned to the customer. Either the plan is missing its customer-side tasks, or somebody is about to be surprised.",
          }
      : {
          kind: "absent",
          note: "Nothing to ask for yet — there is no project and therefore no task list.",
        },
  });

  if (plan?.planUrl) {
    slides.push({
      title: "Where to follow it",
      body: {
        kind: "prose",
        text: `Everything above lives at ${plan.planUrl}. You can see what is with you, tick things off, and ask questions there — it stays current, and this deck does not.`,
      },
    });
  }

  /* ----------------------------------------------------- starting delivery */

  act("Starting delivery", "What onboarding needs next");

  slides.push({
    title: "Questions for onboarding",
    subtitle: "What the specialist needs answered in week one",
    body: brief.discovery_questions.length
      ? {
          kind: "table",
          header: ["Question", "Why it matters", "Area"],
          rows: brief.discovery_questions.map((q) => [
            q.question,
            fit(q.why_it_matters, 160),
            q.category,
          ]),
        }
      : {
          kind: "absent",
          note: "No discovery questions were generated. Week one has no agenda.",
        },
  });

  slides.push({
    title: "Risks and open items",
    body: brief.risks_open_items.length
      ? { kind: "bullets", items: brief.risks_open_items.map((r) => fit(r, 200)) }
      : { kind: "absent", note: "Nothing was flagged as a risk or left open." },
  });

  // The template's closing slide, left deliberately empty of content. It is
  // filled in during the meeting — pre-filling it with guesses about who owns
  // what is how a kickoff produces actions nobody agreed to.
  slides.push({
    title: "Next steps and action plan",
    subtitle: "Agreed in this meeting",
    body: {
      kind: "table",
      header: ["Step", "Owner", "Due", "Status", "Notes"],
      rows: [
        ["", "", "", "", ""],
        ["", "", "", "", ""],
        ["", "", "", "", ""],
        ["", "", "", "", ""],
      ],
    },
  });

  return {
    accountName: account.name,
    preparedAt: input.preparedAt,
    agenda,
    slides,
  };
}
