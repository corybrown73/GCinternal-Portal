import { describe, expect, it } from "vitest";

import {
  forcedNote,
  missingForClosedWon,
  parseWonGate,
  WON_GATE_PREFIX,
  wonGateMessage,
} from "../won-gate";

describe("the Closed Won gate", () => {
  it("names what the deal lacks", () => {
    expect(missingForClosedWon({ reports: 0, sowPath: null, sowReference: null })).toEqual([
      "notes",
      "sow",
    ]);
    expect(missingForClosedWon({ reports: 2, sowPath: null, sowReference: "  " })).toEqual(["sow"]);
    expect(missingForClosedWon({ reports: 0, sowPath: "deals/x.pdf", sowReference: null })).toEqual(
      ["notes"],
    );
    expect(missingForClosedWon({ reports: 1, sowPath: null, sowReference: "Q-2026-0917" })).toEqual(
      [],
    );
  });

  it("writes a sentence the page can read back", () => {
    const msg = wonGateMessage(["notes", "sow"]);
    expect(msg.startsWith(WON_GATE_PREFIX)).toBe(true);
    expect(msg).toContain("no a Gong brief or call note and no the signed SOW or contract");
    expect(parseWonGate(msg)).toEqual(["notes", "sow"]);
    expect(parseWonGate(wonGateMessage(["sow"]))).toEqual(["sow"]);
    expect(parseWonGate("Deal not found")).toBeNull();
    // An older message without the key list still reads as the gate.
    expect(parseWonGate(`${WON_GATE_PREFIX} the deal has no SOW.`)).toEqual(["notes", "sow"]);
  });

  it("records a forced move on the note the database reads", () => {
    expect(forcedNote(undefined)).toBe("force: Moved despite the Closed Won check");
    expect(forcedNote("Signed copy is with legal")).toBe("force: Signed copy is with legal");
  });
});
