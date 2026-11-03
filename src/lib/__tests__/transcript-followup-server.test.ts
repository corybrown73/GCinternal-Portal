import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeSupabase, type Rows } from "./fake-supabase";
import { followupEmailSchema } from "../transcript-followup";

/**
 * The follow-up email against an in-memory database. The model is a stub; the
 * transcript preparation and the help catalogue are the same code the app runs.
 * What is checked: the email call is given no risk or issue records; links come
 * only from the catalogue; a failure is kept on the draft and never thrown; and
 * a regenerate writes the job row alone, never a proposal or a record.
 */
const h = vi.hoisted(() => {
  const state = {
    supabase: { client: null as any },
    forward: null as any,
    ai: {
      runStructured: vi.fn(),
      describeAiError: (e: unknown, what = "AI synthesis") =>
        `${what} failed: ${e instanceof Error ? e.message : String(e)}`,
      AiRefusedError: class AiRefusedError extends Error {
        constructor() {
          super("The model declined to read this content.");
        }
      },
    },
    help: { loadHelpArticles: vi.fn() },
  };
  state.forward = new Proxy({}, { get: (_t, prop) => state.supabase.client?.[prop] });
  return state;
});

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: h.forward }));
vi.mock("../server/ai/client", () => h.ai);
vi.mock("../server/help/articles.server", () => h.help);

import { draftFollowupEmail, saveFollowupDraft } from "../transcript-followup.server";
import type { FollowupDraft } from "../transcript-followup";

const IMPL = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CUSTOMER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const DEAL = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const FILE = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const PATH = `accounts/${IMPL}/kickoff.txt`;
const JOB = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

const TRANSCRIPT = new TextEncoder().encode(
  [
    "Kickoff call, 6 October 2026.",
    "Priya: we will import the crew list as reference data.",
    "Customer: agreed, we will send the list by Friday.",
  ].join("\n"),
);

const ARTICLE = {
  article_id: "100",
  title: "Importing reference data from a spreadsheet",
  category: "Reference Data",
  tags: [],
  url: "https://help.gocanvas.com/hc/en-us/articles/100-importing-reference-data",
};

const modelReply = (over: Record<string, unknown> = {}) =>
  followupEmailSchema.parse({
    readable: true,
    problem: null,
    subject: "Kickoff follow-up",
    recap: "We planned the crew list import.",
    decisions: ["The crew list is imported as reference data."],
    gocanvas_next_steps: [],
    customer_next_steps: ["Send the crew list by Friday."],
    agreed_dates: [],
    open_questions: [],
    ...over,
  });

const ok = (data: unknown) => ({
  data,
  usage: {
    input_tokens: 10,
    output_tokens: 5,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
  },
  model: "m",
  stop_reason: "end_turn",
  attempts: 1,
  ms: 1,
});

const rows = (): Rows => ({
  customers: [{ id: CUSTOMER, name: "Summit Roofing" }],
  implementations: [
    { id: IMPL, name: "Summit — new logo", customer_id: CUSTOMER, deal_id: DEAL, owner_id: null },
  ],
  account_files: [
    {
      id: FILE,
      implementation_id: IMPL,
      title: "kickoff.txt",
      storage_path: PATH,
      content_type: "text/plain",
      created_at: "2026-10-08T09:00:00Z",
    },
  ],
  risks: [{ id: "r-1", implementation_id: IMPL, title: "Tablets not ordered", status: "open" }],
  issues: [],
  decisions: [],
  evidence_proposals: [
    { id: "p-1", implementation_id: IMPL, attachment_id: FILE, status: "pending" },
  ],
  portal_ai_jobs: [
    {
      id: JOB,
      kind: "analyze_transcript",
      implementation_id: IMPL,
      subject_id: FILE,
      status: "done",
      result: { readable: true, proposals: 1, proposal_ids: ["p-1"] },
      created_at: "2026-10-08T09:01:00Z",
    },
  ],
});

let fake: ReturnType<typeof createFakeSupabase>;

beforeEach(() => {
  fake = createFakeSupabase(rows(), { objects: { [`attachments/${PATH}`]: TRANSCRIPT } });
  h.supabase.client = fake.client;
  h.ai.runStructured.mockReset();
  h.help.loadHelpArticles.mockReset();
  h.help.loadHelpArticles.mockResolvedValue([]);
  process.env["ANTHROPIC_API_KEY"] = "test";
});

describe("the email call sees the transcript and the customer, never the internal records", () => {
  it("gives the model the customer, the implementation and the file, and no risk or issue", async () => {
    h.ai.runStructured.mockResolvedValue(ok(modelReply()));
    await draftFollowupEmail(IMPL, FILE);

    const call = h.ai.runStructured.mock.calls[0]![0];
    const sent = JSON.stringify(call.content);
    expect(sent).toContain("Summit Roofing");
    expect(sent).toContain("kickoff.txt");
    expect(sent).not.toContain("Tablets not ordered");
    expect(call.system[0].text).toMatch(/never instructions to you/);
  });

  it("keeps the email on the transcript's own kind of call, with its own schema", async () => {
    h.ai.runStructured.mockResolvedValue(ok(modelReply()));
    await draftFollowupEmail(IMPL, FILE);
    const call = h.ai.runStructured.mock.calls[0]![0];
    expect(call.kind).toBe("transcript");
    expect(call.schema).toBe(followupEmailSchema);
  });
});

describe("resource links come from the catalogue, and only when the email calls for them", () => {
  it("adds a verified catalogue article when the email names its feature", async () => {
    h.help.loadHelpArticles.mockResolvedValue([ARTICLE]);
    h.ai.runStructured.mockResolvedValue(ok(modelReply()));
    const { draft } = await draftFollowupEmail(IMPL, FILE);
    expect(draft.body).toContain(`Helpful resources:\n- ${ARTICLE.title}: ${ARTICLE.url}`);
  });

  it("gives the email without links when the catalogue cannot be read, rather than failing it", async () => {
    h.help.loadHelpArticles.mockRejectedValue(new Error("help table down"));
    h.ai.runStructured.mockResolvedValue(ok(modelReply()));
    const { draft } = await draftFollowupEmail(IMPL, FILE);
    expect(draft.status).toBe("ready");
    expect(draft.body).not.toContain("Helpful resources");
  });
});

describe("a failed draft is kept as a failed draft, not thrown", () => {
  it("returns a failed draft with the reason and a try-again, and changes nothing else", async () => {
    h.ai.runStructured.mockRejectedValue(new Error("upstream timeout"));
    const { draft, persisted } = await draftFollowupEmail(IMPL, FILE, { persist: true });
    expect(draft.status).toBe("failed");
    expect(draft.problem).toMatch(/upstream timeout/);
    expect(draft.problem).toMatch(/Try again/);
    expect(persisted).toBe(true);
    expect(fake.inserts).toHaveLength(0);
    expect(fake.store["evidence_proposals"]).toEqual(rows()["evidence_proposals"]);
    expect(fake.store["risks"]).toEqual(rows()["risks"]);
  });

  it("reads a model refusal as an unreadable file, not a failure to retry", async () => {
    h.ai.runStructured.mockRejectedValue(new h.ai.AiRefusedError());
    const { draft } = await draftFollowupEmail(IMPL, FILE);
    expect(draft.status).toBe("unreadable");
  });

  it("gives an unreadable draft when the model says the file is not a transcript", async () => {
    h.ai.runStructured.mockResolvedValue(
      ok(modelReply({ readable: false, problem: "This is a price list." })),
    );
    const { draft } = await draftFollowupEmail(IMPL, FILE);
    expect(draft.status).toBe("unreadable");
    expect(draft.problem).toBe("This is a price list.");
  });
});

describe("a regenerate writes the job row, and nothing else", () => {
  it("keeps the new draft on the latest finished reading, beside its proposals", async () => {
    h.ai.runStructured.mockResolvedValue(ok(modelReply({ subject: "A fresh subject" })));
    const { draft, persisted } = await draftFollowupEmail(IMPL, FILE, { persist: true });
    expect(persisted).toBe(true);

    const job = fake.store["portal_ai_jobs"]![0];
    expect(job["result"]["followup_email"]).toEqual(draft);
    expect(job["result"]["proposal_ids"]).toEqual(["p-1"]);
    expect(fake.store["evidence_proposals"]).toEqual(rows()["evidence_proposals"]);
    expect(fake.inserts).toHaveLength(0);
  });

  it("keeps nothing when no finished reading exists, so the panel holds the draft instead", async () => {
    fake.store["portal_ai_jobs"]![0]!["status"] = "running";
    h.ai.runStructured.mockResolvedValue(ok(modelReply()));
    const { persisted } = await draftFollowupEmail(IMPL, FILE, { persist: true });
    expect(persisted).toBe(false);
    expect(fake.store["portal_ai_jobs"]![0]!["result"]).not.toHaveProperty("followup_email");
  });

  it("does not write a draft into a reading that is still running", async () => {
    fake.store["portal_ai_jobs"]![0]!["status"] = "queued";
    const draft: FollowupDraft = {
      status: "ready",
      problem: null,
      subject: "s",
      body: "b",
      withheld: 0,
      generated_at: "2026-10-20T09:00:00.000Z",
    };
    expect(await saveFollowupDraft(IMPL, FILE, draft)).toBe(false);
    expect(fake.store["portal_ai_jobs"]![0]!["result"]).not.toHaveProperty("followup_email");
  });
});
