import { describe, expect, it } from "vitest";

import {
  alreadyOwned,
  fromTheSowLine,
  nextCardsNotOwned,
  sowAttachedButUnread,
} from "../already-bought";

const card = (name: string) => ({ name, description: null });

describe("cards the customer already bought or named", () => {
  it("drops a card that shares a distinctive word with a purchased service", () => {
    expect(alreadyOwned("Backflow Test Report", ["Backflow PDF"])).toBe(true);
    expect(alreadyOwned("Work Order", ["Service Work Order"])).toBe(true);
    expect(alreadyOwned("Service Work Order", ["Service Work Order"])).toBe(true);
  });

  it("keeps a card that only shares generic words", () => {
    expect(alreadyOwned("Safety Inspection Report", ["Backflow PDF", "Service Work Order"])).toBe(
      false,
    );
    expect(alreadyOwned("Daily Timesheet", ["QuickBooks Online integration"])).toBe(false);
  });

  it("keeps an all-generic card that sits inside a distinctive owned name", () => {
    expect(alreadyOwned("Inspection Report", ["Backflow Inspection Report"])).toBe(false);
    expect(alreadyOwned("Inspection Form", ["Backflow Inspection Form"])).toBe(false);
  });

  it("keeps a card that shares only a common field-service word", () => {
    expect(alreadyOwned("Customer Feedback Survey", ["Customer Signature PDF"])).toBe(false);
    expect(alreadyOwned("Equipment Inspection", ["Equipment Rental Agreement"])).toBe(false);
    expect(alreadyOwned("Job Safety Analysis", ["Job Hazard Analysis"])).toBe(false);
    expect(alreadyOwned("Site Inspection", ["Site Survey"])).toBe(false);
    expect(alreadyOwned("Maintenance Checklist", ["Preventive Maintenance Report"])).toBe(false);
  });

  it("leaves the shelf out while the SOW is attached and unread", () => {
    const out = nextCardsNotOwned({
      chosen: [card("Backflow Test Report"), card("Job Safety Analysis")],
      shelf: [card("Fire Sprinkler Inspection"), card("Water Heater Install")],
      owned: ["Service Work Order"],
      sowUnread: true,
    });
    expect(out.shelf).toEqual([]);
    expect(out.chosen.map((c) => c.name)).toEqual(["Backflow Test Report", "Job Safety Analysis"]);
  });

  it("filters both lists once the SOW is read", () => {
    const out = nextCardsNotOwned({
      chosen: [card("Backflow Test Report"), card("Job Safety Analysis")],
      shelf: [card("Backflow Assembly Test"), card("Water Heater Install"), card("Work Order")],
      owned: ["Backflow PDF", "Service Work Order"],
      sowUnread: false,
    });
    expect(out.chosen.map((c) => c.name)).toEqual(["Job Safety Analysis"]);
    expect(out.shelf.map((c) => c.name)).toEqual(["Water Heater Install"]);
  });

  it("knows an attached SOW nobody has read", () => {
    expect(sowAttachedButUnread({ sowAttached: true, sowAppliedAt: null, services: [] })).toBe(
      true,
    );
    expect(
      sowAttachedButUnread({ sowAttached: true, sowAppliedAt: "2026-10-02", services: [] }),
    ).toBe(false);
    expect(
      sowAttachedButUnread({ sowAttached: true, sowAppliedAt: null, services: [{ id: "x" }] }),
    ).toBe(false);
    expect(sowAttachedButUnread({ sowAttached: false, sowAppliedAt: null, services: [] })).toBe(
      false,
    );
  });
});

describe("the Review step's From the SOW line", () => {
  it("says the SOW is not read yet instead of 'core only'", () => {
    expect(fromTheSowLine({ services: [], sowAttached: true, sowAppliedAt: null })).toBe(
      "SOW not read yet",
    );
  });

  it("says core only once the SOW was read and bought nothing more", () => {
    expect(
      fromTheSowLine({ services: [], sowAttached: true, sowAppliedAt: "2026-10-02T00:00:00Z" }),
    ).toBe("Core only — no services");
  });

  it("lists the services when there are any, and says when there is no SOW", () => {
    expect(
      fromTheSowLine({
        services: [
          { name: "Backflow PDF", phase: 2 },
          { name: "QuickBooks Online", phase: 2 },
        ],
        sowAttached: true,
        sowAppliedAt: null,
      }),
    ).toBe("Backflow PDF (phase 2) · QuickBooks Online (phase 2)");
    expect(fromTheSowLine({ services: [], sowAttached: false, sowAppliedAt: null })).toBe("No SOW");
  });
});
