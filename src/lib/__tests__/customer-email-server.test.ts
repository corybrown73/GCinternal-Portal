import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeSupabase, type Rows } from "./fake-supabase";
import { customerEmailSchema } from "../customer-email";

/**
 * The Customer 360 email against an in-memory database. The model is a stub.
 * What is checked: the context is the customer-facing view only (shared,
 * customer-party, open tasks and the commitments still owed); the model never
 * sees internal work or risks; a meeting follow-up goes through the transcript
 * workflow with the specialist's note and without persisting; a failure is a
 * failed draft, not a throw; and nothing is written to the database.
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
    name: { customerFacingNameFor: vi.fn() },
    followup: { draftFollowupEmail: vi.fn() },
  };
  state.forward = new Proxy({}, { get: (_t, prop) => state.supabase.client?.[prop] });
  return state;
});

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: h.forward }));
vi.mock("../server/ai/client", () => h.ai);
vi.mock("../server/help/articles.server", () => h.help);
vi.mock("../server/customer-facing-name", () => h.name);
vi.mock("../transcript-followup.server", () => h.followup);

import { draftCustomerEmail, loadCustomerEmailContext } from "../customer-email.server";

const CUST = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OTHER_CUST = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const IMPL = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const FILE = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const ARTICLE = {
  article_id: "100",
  title: "Importing reference data from a spreadsheet",
  category: "Reference Data",
  tags: [],
  url: "https://help.gocanvas.com/hc/en-us/articles/100-importing-reference-data",
};

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

const modelBody = (body: string, over: Record<string, unknown> = {}) =>
  customerEmailSchema.parse({
    readable: true,
    problem: null,
    subject: "Checking in",
    body,
    ...over,
  });

const rows = (): Rows => ({
  customers: [{ id: CUST, name: "Summit Roofing" }],
  implementations: [
    { id: IMPL, name: "Summit — new logo", customer_id: CUST, current_stage: "build" },
  ],
  work_items: [
    {
      id: "w1",
      implementation_id: IMPL,
      title: "Send us the crew list",
      status: "not_started",
      party: "customer",
      visibility: "shared",
      due_at: "2026-10-30",
    },
    {
      id: "w2",
      implementation_id: IMPL,
      title: "INTERNAL pricing review",
      status: "not_started",
      party: "internal",
      visibility: "shared",
      due_at: null,
    },
    {
      id: "w3",
      implementation_id: IMPL,
      title: "Private customer task",
      status: "not_started",
      party: "customer",
      visibility: "internal",
      due_at: null,
    },
    {
      id: "w4",
      implementation_id: IMPL,
      title: "Finished customer task",
      status: "done",
      party: "customer",
      visibility: "shared",
      due_at: null,
    },
  ],
  commitments: [
    {
      id: "c1",
      implementation_id: IMPL,
      description: "Deliver the form changes",
      due_date: "2026-10-18",
      status: "open",
      committed_to: "customer",
    },
    {
      id: "c2",
      implementation_id: IMPL,
      description: "Internal-only commitment",
      due_date: null,
      status: "open",
      committed_to: "internal",
    },
    {
      id: "c3",
      implementation_id: IMPL,
      description: "Already delivered",
      due_date: null,
      status: "met",
      committed_to: "customer",
    },
  ],
  risks: [{ id: "r-1", implementation_id: IMPL, title: "Tablets not ordered", status: "open" }],
  portal_ai_jobs: [],
  evidence_proposals: [],
});

let fake: ReturnType<typeof createFakeSupabase>;

const baseInput = {
  customerId: CUST,
  implementationId: IMPL,
  instructions: null,
  attachmentId: null,
} as const;

beforeEach(() => {
  fake = createFakeSupabase(rows());
  h.supabase.client = fake.client;
  h.ai.runStructured.mockReset();
  h.help.loadHelpArticles.mockReset();
  h.help.loadHelpArticles.mockResolvedValue([]);
  h.name.customerFacingNameFor.mockReset();
  h.name.customerFacingNameFor.mockResolvedValue("Summit — new logo");
  h.followup.draftFollowupEmail.mockReset();
  process.env["ANTHROPIC_API_KEY"] = "test";
});

describe("the context is the customer-facing view and nothing internal", () => {
  it("reads the customer's shared, open tasks and the commitments still owed to them", async () => {
    const ctx = await loadCustomerEmailContext(CUST, IMPL);
    expect(ctx.nextSteps.map((s) => s.title)).toEqual(["Send us the crew list"]);
    expect(ctx.commitments.map((c) => c.title)).toEqual(["Deliver the form changes"]);
    expect(ctx.stageLabel).not.toBeNull();
    expect(ctx.customerName).toBe("Summit Roofing");
  });

  it("uses the customer-facing name of the implementation, not the internal one", async () => {
    const ctx = await loadCustomerEmailContext(CUST, IMPL);
    expect(ctx.implementationName).toBe("Summit — new logo");
    expect(h.name.customerFacingNameFor).toHaveBeenCalledWith({
      implementationId: IMPL,
      fallback: "Summit — new logo",
    });
  });

  it("refuses an implementation that is not this customer's", async () => {
    await expect(loadCustomerEmailContext(OTHER_CUST, IMPL)).rejects.toThrow(/not this customer's/);
  });
});

describe("a general email", () => {
  it("sends the model the customer-facing facts and the specialist's note, and no internal record", async () => {
    h.ai.runStructured.mockResolvedValue(ok(modelBody("I wanted to see how testing is going.")));
    await draftCustomerEmail({
      ...baseInput,
      type: "check_in",
      instructions: "Ask whether they are ready for the next session.",
    });

    const call = h.ai.runStructured.mock.calls[0]![0];
    expect(call.kind).toBe("customer_email");
    expect(call.schema).toBe(customerEmailSchema);
    const sent = JSON.stringify(call.content);
    expect(sent).toContain("Send us the crew list");
    expect(sent).toContain("Deliver the form changes");
    expect(sent).toContain("Ask whether they are ready for the next session.");
    expect(sent).not.toContain("INTERNAL pricing review");
    expect(sent).not.toContain("Private customer task");
    expect(sent).not.toContain("Internal-only commitment");
    expect(sent).not.toContain("Finished customer task");
    expect(sent).not.toContain("Tablets not ordered");
  });

  it("never sends the model a URL or a link to write, since links come only from the catalogue", async () => {
    h.ai.runStructured.mockResolvedValue(ok(modelBody("Hello.")));
    await draftCustomerEmail({ ...baseInput, type: "check_in", instructions: null });
    const system = h.ai.runStructured.mock.calls[0]![0].system[0].text;
    expect(system).toMatch(/Include no links and no URLs/);
  });

  it("returns a draft with the greeting and sign-off, the context summary, and no stored row", async () => {
    h.ai.runStructured.mockResolvedValue(ok(modelBody("We are on track for the crew list.")));
    const { draft } = await draftCustomerEmail({
      ...baseInput,
      type: "request",
      instructions: null,
    });
    expect(draft.status).toBe("ready");
    expect(draft.body).toBe("Hi there,\n\nWe are on track for the crew list.\n\nThanks,");
    expect(draft.context_summary).toMatch(/1 open customer step/);
    expect(fake.inserts).toHaveLength(0);
    expect(fake.store["portal_ai_jobs"]).toEqual([]);
    expect(fake.store["risks"]).toEqual(rows()["risks"]);
  });

  it("says plainly when the context is thin, and tells the model to write something general", async () => {
    fake.store["work_items"] = [];
    fake.store["commitments"] = [];
    h.ai.runStructured.mockResolvedValue(ok(modelBody("Just checking in.")));
    const { draft } = await draftCustomerEmail({
      ...baseInput,
      type: "check_in",
      instructions: null,
    });
    expect(draft.context_summary).toMatch(/names only/);
    const sent = JSON.stringify(h.ai.runStructured.mock.calls[0]![0].content);
    expect(sent).toContain("Little is recorded");
  });

  it("attaches help-centre links only when the email names a feature the article teaches", async () => {
    h.help.loadHelpArticles.mockResolvedValue([ARTICLE]);
    h.ai.runStructured.mockResolvedValue(
      ok(modelBody("Importing reference data from a spreadsheet is the next thing to try.")),
    );
    const { draft } = await draftCustomerEmail({
      ...baseInput,
      type: "check_in",
      instructions: null,
    });
    expect(draft.resources).toEqual([
      {
        title: ARTICLE.title,
        url: ARTICLE.url,
        why: "Useful for reference data, which came up in the meeting.",
      },
    ]);
  });

  it("gives the email without links when the catalogue cannot be read", async () => {
    h.help.loadHelpArticles.mockRejectedValue(new Error("help table down"));
    h.ai.runStructured.mockResolvedValue(ok(modelBody("Reference data is on track.")));
    const { draft } = await draftCustomerEmail({
      ...baseInput,
      type: "check_in",
      instructions: null,
    });
    expect(draft.status).toBe("ready");
    expect(draft.resources).toEqual([]);
  });

  it("gives no email, and says why, when the model reports the context unreadable", async () => {
    h.ai.runStructured.mockResolvedValue(
      ok(modelBody("", { readable: false, problem: "Too little on record to write from." })),
    );
    const { draft } = await draftCustomerEmail({
      ...baseInput,
      type: "check_in",
      instructions: null,
    });
    expect(draft.status).toBe("unreadable");
    expect(draft.problem).toBe("Too little on record to write from.");
  });

  it("reads a refusal as unreadable, not as a failure to retry", async () => {
    h.ai.runStructured.mockRejectedValue(new h.ai.AiRefusedError());
    const { draft } = await draftCustomerEmail({
      ...baseInput,
      type: "custom",
      instructions: "Say hello.",
    });
    expect(draft.status).toBe("unreadable");
  });

  it("keeps a failure as a failed draft with the reason and a try-again, and never throws", async () => {
    h.ai.runStructured.mockRejectedValue(new Error("upstream timeout"));
    const { draft } = await draftCustomerEmail({
      ...baseInput,
      type: "check_in",
      instructions: null,
    });
    expect(draft.status).toBe("failed");
    expect(draft.problem).toMatch(/upstream timeout.*Try again/);
    expect(fake.inserts).toHaveLength(0);
  });
});

describe("a meeting follow-up goes through the transcript workflow", () => {
  it("passes the specialist's note to it, and asks it not to persist", async () => {
    h.followup.draftFollowupEmail.mockResolvedValue({
      draft: {
        status: "ready",
        problem: null,
        subject: "Kickoff follow-up",
        body: "Hi there,\n\nThanks,",
        withheld: 0,
        generated_at: AT,
      },
      usage: null,
      persisted: false,
    });
    const { draft } = await draftCustomerEmail({
      ...baseInput,
      type: "meeting_followup",
      instructions: "Stress the go-live date.",
      attachmentId: FILE,
    });
    expect(h.followup.draftFollowupEmail).toHaveBeenCalledWith(IMPL, FILE, {
      instructions: "Stress the go-live date.",
      persist: false,
    });
    expect(draft.subject).toBe("Kickoff follow-up");
    expect(draft.resources).toEqual([]);
    expect(h.ai.runStructured).not.toHaveBeenCalled();
  });

  it("asks for a transcript before any model call when none is chosen", async () => {
    const { draft } = await draftCustomerEmail({
      ...baseInput,
      type: "meeting_followup",
      instructions: null,
      attachmentId: null,
    });
    expect(draft.status).toBe("failed");
    expect(draft.problem).toMatch(/Choose the meeting transcript/);
    expect(h.followup.draftFollowupEmail).not.toHaveBeenCalled();
  });
});

const AT = "2026-10-20T09:00:00.000Z";
