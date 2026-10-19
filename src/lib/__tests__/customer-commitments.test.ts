import { describe, expect, it } from "vitest";

import { commitmentHistory, customerCommitments, owedToCustomer } from "../customer-commitments";

const TODAY = "2026-10-19";
const NAMES = new Map([["i1", "Rollout"]]);
const row = (id: string, status: string | null, over: object = {}) => ({
  id,
  implementation_id: "i1",
  description: `Commitment ${id}`,
  due_date: "2026-10-01",
  status,
  committed_to: "customer",
  ...over,
});

describe("customerCommitments", () => {
  it("gives each promise the words the customer sees", () => {
    const items = customerCommitments(
      [
        row("met", "met"),
        row("fulfilled", "fulfilled"),
        row("cancelled", "cancelled"),
        row("renegotiated", "renegotiated"),
        row("missed", "missed"),
        row("open", "open"),
      ],
      NAMES,
      TODAY,
    );
    expect(Object.fromEntries(items.map((s) => [s.id, s.status_label]))).toEqual({
      met: "Done",
      fulfilled: "Done",
      cancelled: "Withdrawn",
      renegotiated: "Renegotiated — Outstanding",
      missed: "Missed — Outstanding",
      open: "Outstanding",
    });
  });

  it("marks only outstanding promises overdue", () => {
    const items = customerCommitments(
      [row("met", "met"), row("cancelled", "cancelled"), row("open", "open")],
      NAMES,
      TODAY,
    );
    expect(Object.fromEntries(items.map((s) => [s.id, s.overdue]))).toEqual({
      met: false,
      cancelled: false,
      open: true,
    });
  });

  it("shows only promises whose audience is exactly the customer", () => {
    const items = customerCommitments(
      [
        row("customer", "open"),
        row("internal", "open", { committed_to: "internal" }),
        row("named", "open", { committed_to: "Ada" }),
        row("blank", "open", { committed_to: null }),
        row("plural", "open", { committed_to: "customers" }),
      ],
      NAMES,
      TODAY,
    );
    expect(items.map((s) => s.id)).toEqual(["customer"]);
  });

  it("accepts the customer audience regardless of case and spacing", () => {
    const items = customerCommitments(
      [row("spaced", "open", { committed_to: "  Customer " })],
      NAMES,
      TODAY,
    );
    expect(items.map((s) => s.id)).toEqual(["spaced"]);
  });

  it("names the implementation each one belongs to", () => {
    expect(customerCommitments([row("a", "open")], NAMES, TODAY)[0]?.implementation_name).toBe(
      "Rollout",
    );
  });
});

describe("owedToCustomer and commitmentHistory", () => {
  const items = customerCommitments(
    [
      row("met-early", "met", { due_date: "2026-09-01" }),
      row("open-late", "open", { due_date: "2026-11-01" }),
      row("withdrawn", "cancelled", { due_date: "2026-08-01" }),
      row("open-early", "open", { due_date: "2026-10-01" }),
      row("renegotiated", "renegotiated", { due_date: "2026-10-15" }),
      row("missed", "missed", { due_date: "2026-09-20" }),
      row("met-late", "fulfilled", { due_date: "2026-10-05" }),
    ],
    NAMES,
    TODAY,
  );

  it("keeps renegotiated and missed promises owed until they are resolved", () => {
    const owed = owedToCustomer(items).map((c) => c.id);
    expect(owed).toContain("renegotiated");
    expect(owed).toContain("missed");
  });

  it("lists what is owed earliest due first", () => {
    expect(owedToCustomer(items).map((c) => c.id)).toEqual([
      "missed",
      "open-early",
      "renegotiated",
      "open-late",
    ]);
  });

  it("puts done and withdrawn promises in history, and nothing owed", () => {
    const history = commitmentHistory(items);
    expect(history.map((c) => c.id).sort()).toEqual(["met-early", "met-late", "withdrawn"]);
    for (const c of history) expect(c.state).not.toBe("outstanding");
    expect(history.some((c) => c.id === "renegotiated" || c.id === "missed")).toBe(false);
  });

  it("shows the most recently due history first", () => {
    expect(commitmentHistory(items).map((c) => c.id)).toEqual([
      "met-late",
      "met-early",
      "withdrawn",
    ]);
  });
});
