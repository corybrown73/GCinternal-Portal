import { describe, expect, it } from "vitest";

import { keywords, rankArticles, type HelpArticle } from "../help-articles";
import { readIntake } from "../intake-answers";

const lib: HelpArticle[] = [
  {
    article_id: "1",
    title: "Upload a Google Sheet as Reference Data",
    category: "Reference Data",
    tags: ["upload", "google", "sheet", "reference", "data"],
    url: "https://help.gocanvas.com/hc/en-us/articles/1",
  },
  {
    article_id: "2",
    title: "Dispatch a form to a user",
    category: "Dispatch",
    tags: ["dispatch", "assign", "user"],
    url: "https://help.gocanvas.com/hc/en-us/articles/2",
  },
  {
    article_id: "3",
    title: "26 March '26 Device Release Notes: iOS 17.8.0",
    category: "Device Releases",
    tags: ["release", "notes", "dispatch"],
    url: "https://help.gocanvas.com/hc/en-us/articles/3",
  },
  {
    article_id: "4",
    title: "Reference Data in the Legacy Builder",
    category: "Legacy Builder Basics",
    tags: ["reference", "data", "legacy"],
    url: "https://help.gocanvas.com/hc/en-us/articles/4",
  },
  {
    article_id: "5",
    title: "Add a photo field",
    category: "Builder Field Types",
    tags: ["photo", "field"],
    url: "https://help.gocanvas.com/hc/en-us/articles/5",
  },
];

describe("help articles — ranking the library against the calls", () => {
  it("keeps the words that carry meaning", () => {
    const k = keywords("We want the parts list as reference data and to dispatch jobs");
    expect(k.has("reference")).toBe(true);
    expect(k.has("dispatch")).toBe(true);
    expect(k.has("the")).toBe(false);
    expect(k.has("we")).toBe(false);
  });

  it("puts the article about what they asked for first, and release notes and legacy pages last", () => {
    const ranked = rankArticles(
      "Ray: our parts list lives in a Google Sheet, we want it as reference data on the form. And dispatch to the crew.",
      lib,
    );
    expect(ranked[0]!.article_id).toBe("1");
    expect(ranked.map((a) => a.article_id)).toContain("2");
    expect(ranked.map((a) => a.article_id)).not.toContain("3");
    expect(ranked.map((a) => a.article_id)).not.toContain("5");
    const legacy = ranked.findIndex((a) => a.article_id === "4");
    expect(legacy === -1 || legacy > 1).toBe(true);
  });

  it("returns nothing when the calls say nothing", () => {
    expect(rankArticles("", lib)).toEqual([]);
    expect(rankArticles("the and of", lib)).toEqual([]);
  });
});

describe("help picks on the intake", () => {
  it("reads picks with defaults, and never more than eight", () => {
    const a = readIntake({
      help_picks: [
        { article_id: "1", title: "Reference data", url: "https://help.gocanvas.com/hc/x" },
      ],
    });
    expect(a.help_picks[0]).toMatchObject({ article_id: "1", why: "", source: "ai" });
    const many = readIntake({
      help_picks: Array.from({ length: 9 }, (_, i) => ({
        article_id: String(i),
        title: "t",
        url: "https://help.gocanvas.com/hc/x",
      })),
    });
    // Nine is over the cap: the whole column falls back to empty rather than a partial read.
    expect(many.help_picks).toEqual([]);
  });
});
