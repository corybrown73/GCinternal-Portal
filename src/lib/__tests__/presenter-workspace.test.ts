import { describe, expect, it } from "vitest";

import { isGoCanvasFormUrl, readIntake } from "../intake-answers";
import { timelineFor } from "../onboarding-plan";
import type { Timeline } from "../onboarding-timeline";
import { movesFor, sessionsAfterKickoff } from "../presenter-workspace";

const CLOSE = "2026-10-05";

describe("sessionsAfterKickoff", () => {
  const call = (key: string, time: string | null, serviceId: string | null = null) =>
    ({ key, label: key, date: "2026-10-12", time, kind: "call", serviceId }) as never;

  it("skips Kickoff and reads booked from a set time", () => {
    const rows = sessionsAfterKickoff([
      call("kickoff", "10:00"),
      call("working", "14:00"),
      call("adjust", null),
    ] as Timeline["milestones"]);
    expect(rows.map((r) => [r.key, r.booked])).toEqual([
      ["working", true],
      ["adjust", false],
    ]);
  });

  it("leaves service milestones out and keeps at most three", () => {
    const rows = sessionsAfterKickoff([
      call("kickoff", null),
      call("a", null),
      call("svc", null, "svc-1"),
      call("b", null),
      call("c", null),
      call("d", null),
    ] as Timeline["milestones"]);
    expect(rows.map((r) => r.key)).toEqual(["a", "b", "c"]);
  });
});

describe("movesFor", () => {
  const intake = readIntake({ path: "new_logo" });

  it("moves nothing when a session is kept on its planned date", () => {
    const kickoff = timelineFor(intake, CLOSE).milestones.find((m) => m.key === "kickoff")!;
    expect(movesFor(intake, CLOSE, "kickoff", kickoff.date)).toEqual([]);
  });

  it("lists the later, unfinished milestones a hand-set date pushes", () => {
    const kickoff = timelineFor(intake, CLOSE).milestones.find((m) => m.key === "kickoff")!;
    const moves = movesFor(intake, CLOSE, "kickoff", "2026-11-02");
    expect(moves.length).toBeGreaterThan(0);
    expect(moves.every((m) => m.key !== "kickoff" && m.from !== m.to)).toBe(true);
    expect(kickoff.date).not.toBe("2026-11-02");
  });

  it("never moves a completed milestone", () => {
    const done = readIntake({
      path: "new_logo",
      timeline: { completed: { working: "2026-10-09" } },
    });
    const moves = movesFor(done, CLOSE, "kickoff", "2026-11-02");
    expect(moves.some((m) => m.key === "working")).toBe(false);
  });
});

describe("isGoCanvasFormUrl", () => {
  it("accepts an https link on gocanvas.com", () => {
    expect(isGoCanvasFormUrl("https://app.gocanvas.com/forms/123")).toBe(true);
    expect(isGoCanvasFormUrl("https://gocanvas.com/x")).toBe(true);
  });

  it("refuses anything else", () => {
    expect(isGoCanvasFormUrl("http://app.gocanvas.com/forms/123")).toBe(false);
    expect(isGoCanvasFormUrl("https://evilgocanvas.com/forms/123")).toBe(false);
    expect(isGoCanvasFormUrl("https://gocanvas.com.evil.io/forms/123")).toBe(false);
    expect(isGoCanvasFormUrl("javascript:alert(1)")).toBe(false);
    expect(isGoCanvasFormUrl("not a url")).toBe(false);
  });
});
