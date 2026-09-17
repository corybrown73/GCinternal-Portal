import { describe, expect, it } from "vitest";

import { BRIEF_SHAPE_JSON, extractJsonObject, parseBriefText } from "../server/brief/brief-text";

/**
 * The brief used to go to the API as a constrained-decoding grammar and was
 * rejected on every call ("The compiled grammar is too large") — the tool
 * then quietly wrote a template brief. It now asks for JSON in the reply and
 * validates it here.
 */
const good = {
  account_name: "Summit",
  one_liner: "Summit runs crews on paper and bought GoCanvas to stop.",
  current_process: [
    { title: "Daily report", bullets: ["Paper, photographed", "Emailed at night"] },
  ],
  goals: ["Same-day reports"],
  what_we_know: [{ topic: "Crews", detail: "Twelve crews" }],
  stakeholders: [{ name: "Dana", role: "Ops", notes: "Champion" }],
  risks_open_items: [],
  discovery_questions: [
    { question: "Who owns devices?", why_it_matters: "Rollout", category: "users" },
  ],
  process_gaps: ["Reports lost between truck and office"],
  kickoff: {
    day_90_definition: null,
    scope: [{ workflow: "Daily report", replaces: "Paper form", teams: null }],
    out_of_scope: null,
    integrations: [],
    roles: [],
    licensed_seats: null,
    renewal_date: null,
    it_contact: null,
    training: [],
    kpi_qualifiers: [],
    next_meeting: null,
  },
  expansion: {
    integration_target: null,
    form_already_built: null,
    historical_data: null,
    current_process: null,
    time_saved: null,
    data_flows: [],
    environment_notes: [],
    blockers: [],
  },
};

describe("parseBriefText", () => {
  it("accepts a bare object, a fenced one, and one with a sentence in front", () => {
    const json = JSON.stringify(good);
    for (const text of [json, "```json\n" + json + "\n```", "Here is the brief:\n" + json]) {
      const r = parseBriefText(text);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.data.account_name).toBe("Summit");
    }
  });

  it("names what is wrong so the retry can fix it", () => {
    const r = parseBriefText(JSON.stringify({ ...good, goals: "not a list" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/goals/);
    expect(parseBriefText("no json here").ok).toBe(false);
    expect(parseBriefText("{ not: json").ok).toBe(false);
    expect(extractJsonObject("plain words")).toBeNull();
  });

  it("describes the shape the prompt asks for", () => {
    const shape = JSON.parse(BRIEF_SHAPE_JSON) as { properties: Record<string, unknown> };
    expect(Object.keys(shape.properties)).toEqual(
      expect.arrayContaining(["one_liner", "kickoff", "expansion", "discovery_questions"]),
    );
  });
});
