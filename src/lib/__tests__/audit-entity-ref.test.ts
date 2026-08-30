import { describe, expect, it, vi } from "vitest";

import { entityRef } from "../server/audit";

const base = { actor_type: "user" as const, action: "flag.enabled" };

describe("entityRef", () => {
  it("routes a text key to entity_key and leaves entity_id null", () => {
    expect(entityRef({ ...base, entity_key: "demo_mode" })).toEqual({
      entity_id: null,
      entity_key: "demo_mode",
    });
  });

  it("leaves a real uuid in entity_id", () => {
    const id = "d5200000-0000-4000-8000-000000000001";
    expect(entityRef({ ...base, action: "account.upsert", entity_id: id })).toEqual({
      entity_id: id,
      entity_key: null,
    });
  });

  it("rescues a caller that put a flag name in entity_id, and says so", () => {
    // THE BUG. Every toggle sent "trace_links_editing" into a uuid column;
    // Postgres refused it, the helper retried, then raised a Critical alert —
    // while the Features page said the change had been recorded. A wrong
    // column should not cost an audit trail.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(entityRef({ ...base, entity_id: "trace_links_editing" })).toEqual({
      entity_id: null,
      entity_key: "trace_links_editing",
    });
    // Corrected, but never silently: the call site still needs fixing.
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it("never returns both, because the database refuses both", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const out = entityRef({
      ...base,
      entity_id: "d5200000-0000-4000-8000-000000000001",
      entity_key: "demo_mode",
    });
    expect(out.entity_id).not.toBeNull();
    expect(out.entity_key).toBeNull();
    warn.mockRestore();
  });

  it("allows an event about nothing", () => {
    // A sign-in names no entity. The constraint forbids the ambiguous case,
    // not the empty one.
    expect(entityRef({ ...base, action: "auth.signin" })).toEqual({
      entity_id: null,
      entity_key: null,
    });
  });

  it("treats a malformed uuid as a key rather than sending it to fail", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(entityRef({ ...base, entity_id: "not-a-uuid-at-all" }).entity_key).toBe(
      "not-a-uuid-at-all",
    );
    warn.mockRestore();
  });
});
