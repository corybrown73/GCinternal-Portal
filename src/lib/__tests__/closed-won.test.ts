import { describe, expect, it, vi } from "vitest";

import {
  closedWonSchema,
  ingestClosedWon,
  normalizeClosedWonRow,
  parseMoney,
  parseProducts,
  salesforceAccountIdFrom,
  type ClosedWonDeps,
} from "../server/closed-won";

/**
 * The closed-won webhook, which turns a Google Sheets row into a deal and a
 * kicked-off implementation.
 *
 * WHAT MATTERS HERE. Two things: that a row with the column names a Sheet
 * actually has is accepted rather than 422'd, and that delivering the same
 * row twice — which Zapier does — produces one project, not two.
 */

describe("normalizing a row", () => {
  it("accepts the column names a Sheet actually has", () => {
    const row = normalizeClosedWonRow({
      "Account Name": "Maverick Well Pluggers",
      "Deal Value": "$48,000",
      Rep: "dana@gocanvas.com",
      "Closed Date": "2026-09-08",
      Champion: "Dale Whitcombe",
      "Slack Message": "Closed won! 3 crews, QuickBooks next year",
    });
    expect(row["company"]).toBe("Maverick Well Pluggers");
    expect(row["amount"]).toBe("$48,000");
    expect(row["rep_email"]).toBe("dana@gocanvas.com");
    expect(row["close_date"]).toBe("2026-09-08");
    expect(row["contact_name"]).toBe("Dale Whitcombe");
    expect(row["notes"]).toContain("3 crews");
  });

  it("is not fooled by case, spaces or camelCase in the key", () => {
    expect(normalizeClosedWonRow({ accountName: "A" })["company"]).toBe("A");
    expect(normalizeClosedWonRow({ "ACCOUNT-NAME": "B" })["company"]).toBe("B");
  });

  it("ignores blank cells rather than storing empty strings", () => {
    const row = normalizeClosedWonRow({ company: "A", domain: "", notes: null });
    expect(row["domain"]).toBeUndefined();
    expect(row["notes"]).toBeUndefined();
  });
});

describe("the schema", () => {
  it("requires a company and says which aliases would have worked", () => {
    const r = closedWonSchema.safeParse({ amount: 100 });
    expect(r.success).toBe(false);
    expect(r.success ? "" : r.error.issues[0]!.message).toMatch(
      /company is required.*account_name/,
    );
  });

  it("parses the whole row into typed fields", () => {
    const r = closedWonSchema.parse({
      company: "  Maverick  ",
      amount: "$48,000",
      products: "Forms, Dispatch",
      rep_email: "Dana@GoCanvas.com",
      website: "https://maverickwp.com/about",
      contact_email: "not-an-email",
    });
    expect(r.company).toBe("Maverick");
    expect(r.amount).toBe(48000);
    expect(r.products).toEqual(["Forms", "Dispatch"]);
    expect(r.rep_email).toBe("dana@gocanvas.com");
    expect(r.domain).toBe("maverickwp.com");
    // A bad email is dropped, not stored — and not a reason to reject the row.
    expect(r.contact_email).toBeUndefined();
  });
});

describe("what Slack does to text", () => {
  // The first real row: Slack renders "&" as "&amp;", the Zap copies the
  // rendering, and a customer was created under the wrong name.
  it("decodes HTML entities in every text field", () => {
    const r = closedWonSchema.parse({
      company: "West-Com &amp; TV-Direct",
      opportunity: "Q3 &quot;Forms&quot; deal",
      notes: "Closed won &#39;yesterday&#39; &lt;3",
    });
    expect(r.company).toBe("West-Com & TV-Direct");
    expect(r.opportunity).toBe('Q3 "Forms" deal');
    expect(r.notes).toBe("Closed won 'yesterday' <3");
  });
});

describe("parsing cells", () => {
  it("reads money the way a person types it, and refuses words", () => {
    expect(parseMoney("$48,000")).toBe(48000);
    expect(parseMoney(48000)).toBe(48000);
    expect(parseMoney("$0")).toBe(0);
    // "" → 0 was the trap in update_deal; here words are simply no amount.
    expect(parseMoney("about forty grand")).toBeUndefined();
    expect(parseMoney("TBD")).toBeUndefined();
    expect(parseMoney(-5)).toBeUndefined();
  });

  it("splits products on the separators people use", () => {
    expect(parseProducts("Forms; Dispatch | Analytics")).toEqual([
      "Forms",
      "Dispatch",
      "Analytics",
    ]);
    expect(parseProducts(["Forms", " "])).toEqual(["Forms"]);
    expect(parseProducts("")).toBeUndefined();
  });

  it("takes a Salesforce ACCOUNT id out of a Lightning URL, and only an account id", () => {
    expect(
      salesforceAccountIdFrom(
        undefined,
        "https://gocanvas.lightning.force.com/lightning/r/Account/001Hn00001AbCdEfGH/view",
      ),
    ).toBe("001Hn00001AbCdEfGH");
    // An opportunity id would be stored as the account's and match nothing.
    expect(
      salesforceAccountIdFrom(
        undefined,
        "https://gocanvas.lightning.force.com/lightning/r/Opportunity/006Hn00001AbCdEfGH/view",
      ),
    ).toBeUndefined();
    expect(salesforceAccountIdFrom("006Hn00001AbCdEfGH", undefined)).toBeUndefined();
  });
});

/* ------------------------------------------------------------ the decision */

function deps(over: Partial<ClosedWonDeps> = {}) {
  const calls = { upserts: 0, starts: 0, contacts: [] as unknown[] };
  const d: ClosedWonDeps = {
    upsertAccount: vi.fn(async () => {
      calls.upserts += 1;
      return { account: { id: "deal-1", customer_id: null, stage: "closed_won" }, created: true };
    }),
    recordContact: vi.fn(async (_id, c) => {
      calls.contacts.push(c);
    }),
    startOnboarding: vi.fn(async () => {
      calls.starts += 1;
      return { outcome: "started" as const, customerId: "cust-1", implementationId: "impl-1" };
    }),
    existingImplementation: vi.fn(async () => "impl-existing"),
    ...over,
  };
  return { d, calls };
}

const row = closedWonSchema.parse({
  company: "Maverick Well Pluggers",
  amount: "$48,000",
  contact_name: "Dale Whitcombe",
  contact_role: "VP Operations",
});

describe("ingesting a row", () => {
  it("creates the deal at closed won and kicks off the implementation", async () => {
    const { d, calls } = deps();
    const out = await ingestClosedWon(row, d);

    expect(d.upsertAccount).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Maverick Well Pluggers", stage: "closed_won", arr: 48000 }),
    );
    expect(calls.contacts[0]).toEqual({
      name: "Dale Whitcombe",
      email: undefined,
      role: "VP Operations",
    });
    expect(calls.starts).toBe(1);
    expect(out).toMatchObject({
      deal_id: "deal-1",
      deal_created: true,
      customer_id: "cust-1",
      implementation_id: "impl-1",
      kicked_off: true,
      note: null,
    });
  });

  // Zapier retries and re-triggers on edited rows. The second delivery must
  // update the deal and report the project it already has — never make another.
  it("does not create a second project when the company is already onboarding", async () => {
    const { d, calls } = deps({
      upsertAccount: vi.fn(async () => ({
        account: { id: "deal-1", customer_id: "cust-1", stage: "onboarding_kickoff" },
        created: false,
      })),
    });
    const out = await ingestClosedWon(row, d);

    expect(calls.starts).toBe(0);
    expect(out.kicked_off).toBe(false);
    expect(out.implementation_id).toBe("impl-existing");
    expect(out.customer_id).toBe("cust-1");
    expect(out.note).toMatch(/already onboarding/);
  });

  it("reports, rather than hides, a kick-off that needs a person's decision", async () => {
    const { d } = deps({
      startOnboarding: vi.fn(async () => ({
        outcome: "needs_account_choice" as const,
        customerId: "",
        implementationId: "",
      })),
    });
    const out = await ingestClosedWon(row, d);
    expect(out.kicked_off).toBe(false);
    expect(out.implementation_id).toBeNull();
    expect(out.note).toMatch(/Start onboarding/);
  });

  it("does not touch the contact when the row has none", async () => {
    const { d } = deps();
    await ingestClosedWon(closedWonSchema.parse({ company: "Bare Co" }), d);
    expect(d.recordContact).not.toHaveBeenCalled();
  });

  it("carries the opportunity, close date and Slack text into the deal's summary", async () => {
    const { d } = deps();
    await ingestClosedWon(
      closedWonSchema.parse({
        company: "Bare Co",
        opportunity: "Bare Co — Forms 2026",
        close_date: "2026-09-08",
        slack_message: "Closed won! 3 crews.",
      }),
      d,
    );
    const call = vi.mocked(d.upsertAccount).mock.calls[0]![0];
    expect(call.summary).toContain("Opportunity: Bare Co — Forms 2026");
    expect(call.summary).toContain("Closed: 2026-09-08");
    expect(call.summary).toContain("3 crews");
  });
});
