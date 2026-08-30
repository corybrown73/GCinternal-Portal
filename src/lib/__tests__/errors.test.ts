import { describe, expect, it } from "vitest";

import { isDriverError, userMessage } from "../errors";

describe("isDriverError", () => {
  it("recognises the message that actually reached a user", () => {
    expect(
      isDriverError(
        'insert or update on table "work_items" violates foreign key constraint "work_items_completed_by_fkey"',
      ),
    ).toBe(true);
  });

  it("recognises the flag-audit failure too", () => {
    expect(isDriverError('invalid input syntax for type uuid: "trace_links_editing"')).toBe(true);
  });

  it("does not flag a sentence we wrote for a person", () => {
    expect(isDriverError("A link must start with http:// or https://")).toBe(false);
    expect(isDriverError("Give it a name somebody will recognise")).toBe(false);
  });
});

describe("userMessage", () => {
  it("replaces a driver message with something actionable", () => {
    const out = userMessage(
      "save that task",
      new Error(
        'insert or update on table "work_items" violates foreign key constraint "work_items_completed_by_fkey"',
      ),
    );
    expect(out).toBe(
      "Could not save that task. This has been logged — try again, and tell us if it keeps happening.",
    );
    // The point of the exercise: no table names, no constraint names.
    expect(out).not.toMatch(/work_items|constraint|foreign key/i);
  });

  it("passes our own validation messages straight through", () => {
    // Wrapping these would be a regression: they are the most useful errors in
    // the app, because they tell somebody exactly what to type instead.
    expect(
      userMessage("attach the link", new Error("A link must start with http:// or https://")),
    ).toBe("A link must start with http:// or https://");
  });

  it("wraps an empty or unreadable failure rather than showing a blank", () => {
    expect(userMessage("save that task", null)).toMatch(/^Could not save that task\./);
    expect(userMessage("save that task", new Error(""))).toMatch(/^Could not save that task\./);
  });

  it("wraps anything long enough to be a stack trace rather than a sentence", () => {
    const wall = new Error("something failed\n  at foo (bar.ts:1:1)\n  at baz (qux.ts:2:2)");
    expect(userMessage("save that task", wall)).toMatch(/^Could not save that task\./);
  });
});
