import { describe, expect, it } from "vitest";

import type { HelpArticle } from "../help-articles";
import {
  buildHelpQuery,
  enforcePickRules,
  fallbackPicks,
  integrationAllowed,
  retrieveCandidates,
  sentenceWith,
} from "../help-query";
import { readIntake } from "../intake-answers";

const lib: HelpArticle[] = [
  {
    article_id: "ref-sheet",
    title: "Upload a Google Sheet as Reference Data",
    category: "Reference Data",
    tags: ["upload", "google", "sheet", "reference", "data"],
    url: "https://help.gocanvas.com/hc/en-us/articles/ref-sheet",
  },
  {
    article_id: "ref-overview",
    title: "Reference Data Overview",
    category: "Reference Data",
    tags: ["reference", "data"],
    url: "https://help.gocanvas.com/hc/en-us/articles/ref-overview",
  },
  {
    article_id: "sig",
    title: "Add a Signature Field",
    category: "Builder Field Types",
    tags: ["signature", "field"],
    url: "https://help.gocanvas.com/hc/en-us/articles/sig",
  },
  {
    article_id: "qbo",
    title: "Set up the QuickBooks Online Integration",
    category: "Integrations",
    tags: ["quickbooks", "integration"],
    url: "https://help.gocanvas.com/hc/en-us/articles/qbo",
  },
  {
    article_id: "sf",
    title: "Salesforce Integration Overview",
    category: "Integrations",
    tags: ["salesforce", "integration"],
    url: "https://help.gocanvas.com/hc/en-us/articles/sf",
  },
  {
    article_id: "build",
    title: "Create a Form in the Builder",
    category: "Builder Basics",
    tags: ["create", "form", "builder"],
    url: "https://help.gocanvas.com/hc/en-us/articles/build",
  },
  {
    article_id: "legacy",
    title: "Reference Data in the Legacy Builder",
    category: "Legacy Builder Basics",
    tags: ["reference", "data"],
    url: "https://help.gocanvas.com/hc/en-us/articles/legacy",
  },
  {
    article_id: "notes",
    title: "26 March '26 Device Release Notes: iOS 17.8.0",
    category: "Device Releases",
    tags: ["release", "signature"],
    url: "https://help.gocanvas.com/hc/en-us/articles/notes",
  },
  {
    article_id: "app",
    title: "Install the GoCanvas App",
    category: "GoCanvas on Mobile",
    tags: ["install", "app"],
    url: "https://help.gocanvas.com/hc/en-us/articles/app",
  },
  {
    article_id: "reports",
    title: "Run a Report on Submissions",
    category: "Reports",
    tags: ["report", "submissions"],
    url: "https://help.gocanvas.com/hc/en-us/articles/reports",
  },
];

const notes = `Call recap. Ray: "Our parts list lives in a Google Sheet, the guys pick from it on the truck."
The customer signs off on every ticket before the crew leaves.
They asked whether QuickBooks Online could get the invoices; sales said the SOW would cover that.`;

describe("the help query — built from what the tool knows", () => {
  it("names the features with the sentence that named them, in plan order", () => {
    const q = buildHelpQuery({
      intake: readIntake({ path: "new_logo", industry: "Roofing", field_users: 12 }),
      brief: { goals: ["Stop retyping tickets"] },
      notesText: notes,
    });
    expect(q.flow).toBe("new_logo");
    expect(q.phase1).toBe("build");
    const named = q.features.filter((f) => f.reason === "calls").map((f) => f.feature);
    expect(named).toContain("reference data");
    expect(named).toContain("signatures");
    expect(q.features.find((f) => f.feature === "reference data")!.quote).toMatch(/Google Sheet/);
    expect(q.features.find((f) => f.feature === "signatures")!.when).toBe("after session 1");
    expect(q.features.find((f) => f.feature === "reference data")!.when).toBe("after session 2");
  });

  it("refuses an integration the SOW did not put on the plan, and says why", () => {
    const q = buildHelpQuery({
      intake: readIntake({ path: "new_logo" }),
      brief: null,
      notesText: notes,
    });
    expect(q.allowedIntegrations).toEqual([]);
    expect(q.features.map((f) => f.feature)).not.toContain("integrations");
    expect(q.excluded[0]).toMatchObject({ feature: "integrations" });
  });

  it("allows the integration the SOW put on the plan, in phase 2", () => {
    const q = buildHelpQuery({
      intake: readIntake({
        path: "new_logo",
        timeline: {
          services: [
            { id: "qb", kind: "integration", name: "QuickBooks Online", phase: 2, tool: "qbo" },
          ],
        },
      }),
      brief: null,
      notesText: notes,
    });
    expect(q.allowedIntegrations).toContain("quickbooks");
    const integ = q.features.find((f) => f.feature === "integrations")!;
    expect(integ.when).toBe("phase 2");
    const cands = retrieveCandidates(q, lib);
    const ids = cands.filter((c) => c.feature === "integrations").map((c) => c.article_id);
    expect(ids).toContain("qbo");
    expect(ids).not.toContain("sf");
  });

  it("drops builder basics for a final form on an existing account, and adds the sessions' topics for training", () => {
    const review = buildHelpQuery({
      intake: readIntake({ path: "existing", existing: { form_final: true } }),
      brief: null,
      notesText:
        "We want to build a form for the new crew. The office wants a report every Friday.",
    });
    expect(review.phase1).toBe("review");
    expect(review.features.map((f) => f.feature)).not.toContain("building a form");
    expect(review.excluded.some((e) => e.feature === "building a form")).toBe(true);
    const ff = buildHelpQuery({
      intake: readIntake({ path: "field_fusion" }),
      brief: null,
      notesText: "",
    });
    expect(ff.phase1).toBe("training");
    expect(ff.features.map((f) => f.feature)).toEqual(
      expect.arrayContaining([
        "building a form",
        "reference data",
        "pdf output",
        "reports and exports",
      ]),
    );
    expect(ff.features.every((f) => f.reason === "plan")).toBe(true);
  });
});

describe("retrieval and the rules", () => {
  const q = buildHelpQuery({
    intake: readIntake({ path: "new_logo" }),
    brief: null,
    notesText: notes,
  });
  const cands = retrieveCandidates(q, lib);

  it("keeps release notes and legacy pages out, and prefers the article that matches the quote", () => {
    const ids = cands.map((c) => c.article_id);
    expect(ids).not.toContain("notes");
    expect(ids).not.toContain("legacy");
    const ref = cands.filter((c) => c.feature === "reference data");
    expect(ref[0]!.article_id).toBe("ref-sheet");
  });

  it("enforces one per feature, only candidates, and plan order on whatever the model returns", () => {
    const picks = enforcePickRules(
      [
        { article_id: "ref-overview", why: "You keep a parts list." },
        { article_id: "ref-sheet", why: "twice the same feature" },
        { article_id: "sf", why: "not allowed" },
        { article_id: "made-up", why: "not a candidate" },
        { article_id: "sig", why: "You said the customer signs off on every ticket." },
        { article_id: "app" },
      ],
      q,
      cands,
    );
    const ids = picks.map((p) => p.article_id);
    expect(ids).toContain("ref-overview");
    expect(ids).not.toContain("ref-sheet");
    expect(ids).not.toContain("sf");
    expect(ids).not.toContain("made-up");
    // Plan order: before session 1 (the app), then session 1 (signature), then session 2 (reference data).
    expect(ids.indexOf("app")).toBeLessThan(ids.indexOf("sig"));
    expect(ids.indexOf("sig")).toBeLessThan(ids.indexOf("ref-overview"));
    expect(picks.find((p) => p.article_id === "app")!.why).toMatch(/getting set up/);
  });

  it("falls back to the best candidate per feature with the customer's words as the why", () => {
    const picks = fallbackPicks(q, cands);
    expect(picks.length).toBeGreaterThanOrEqual(2);
    expect(picks.length).toBeLessThanOrEqual(5);
    expect(picks.find((p) => p.feature === "reference data")!.why).toMatch(/Google Sheet/);
  });

  it("lets a generic integration page through and blocks a named system the SOW lacks", () => {
    expect(
      integrationAllowed(
        lib.find((a) => a.article_id === "qbo")!,
        [],
      ),
    ).toBe(false);
    expect(
      integrationAllowed(
        lib.find((a) => a.article_id === "qbo")!,
        ["quickbooks", "online"],
      ),
    ).toBe(true);
    expect(
      integrationAllowed(
        {
          article_id: "x",
          title: "Integrations overview",
          category: "Integrations",
          tags: [],
          url: "u",
        },
        [],
      ),
    ).toBe(true);
  });

  it("pulls the sentence that named a feature", () => {
    expect(sentenceWith(notes, "google sheet")).toMatch(/^Ray: "Our parts list/);
    expect(sentenceWith(notes, "signs off")).toMatch(/customer signs off/);
    expect(sentenceWith(notes, "dispatch")).toBeNull();
  });
});
