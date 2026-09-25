import { describe, expect, it } from "vitest";

import { aeReplyDraft, googleCalendarLink, kickoffOptions } from "../ae-reply";

describe("the AE reply", () => {
  const base = {
    company: "Maverick Roofing",
    contactName: "Ray Okonkwo",
    ownerName: "Dana Whitfield",
    intake: { path: "new_logo" as const, training_only: false },
    welcomeUrl: "https://www.gcinternalportal.com/welcome/wlc_abc",
    plannedKickoff: "2026-09-25",
    today: "2026-09-23",
    timezone: "America/Chicago",
  };

  it("introduces the owner, lays out the three core meetings and offers two Stage 1 times", () => {
    const { subject, body } = aeReplyDraft(base);
    expect(subject).toBe("Maverick Roofing × GoCanvas — booking your kickoff");
    expect(body).toMatch(/^Hi Ray,/);
    expect(body).toContain("I'm Dana Whitfield");
    expect(body).toContain("Stage 2 — Make It Work for Them");
    expect(body).toContain("30-day implementation");
    expect(body).toContain("Could we hold Stage 1");
    expect(body).toContain("https://www.gcinternalportal.com/welcome/wlc_abc");
    expect(body).toContain("• Fri, Sep 25 at 10:00 am Central time");
    expect(body).toContain("• Mon, Sep 28 at 2:00 pm Central time");
  });

  it("keeps the training days for a Device Magic conversion", () => {
    expect(
      aeReplyDraft({ ...base, intake: { path: "dm_conversion", training_only: false } }).body,
    ).toContain("Training day 2");
  });

  it("speaks to a training account and an existing account in their own terms", () => {
    expect(
      aeReplyDraft({ ...base, intake: { path: "field_fusion", training_only: false } }).body,
    ).toContain("Three 30-minute sessions");
    expect(
      aeReplyDraft({ ...base, intake: { path: "existing", training_only: false } }).body,
    ).toContain("form review");
  });

  it("never offers a kickoff in the past", () => {
    expect(kickoffOptions("2026-09-10", "2026-09-23")).toEqual(["2026-09-24", "2026-09-25"]);
  });

  it("builds a Google Calendar invite at the booked time", () => {
    const url = googleCalendarLink({
      title: "Kickoff",
      date: "2026-09-25",
      time: "10:00",
      timezone: "America/Chicago",
      minutes: 60,
      details: "Welcome page",
      guests: ["ray@maverick.com"],
    });
    expect(url).toContain("dates=20260925T150000Z%2F20260925T160000Z");
    expect(url).toContain("add=ray%40maverick.com");
  });
});
