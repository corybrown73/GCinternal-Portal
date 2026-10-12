import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { READING_SLOW_MS, READING_STALE_MS, readingInFlight, readingSlow } from "../stage-flow";

/**
 * Two display guards from the QA pass: a queued reading says "taking longer
 * than usual" after two minutes without changing what counts as in flight
 * (QA 1.1), and no component puts JSX inside a template string, which
 * printed "$<When value={…} />" on the page (QA 12.1).
 */
describe("readingSlow", () => {
  const at = (ms: number) => new Date(Date.now() - ms).toISOString();
  const queued = (ms: number) =>
    ({ status: "queued", started_at: at(ms), heartbeat_at: at(ms) }) as never;

  it("is slow past two minutes queued, while still in flight for the gate", () => {
    expect(readingSlow(queued(READING_SLOW_MS - 5_000))).toBe(false);
    expect(readingSlow(queued(READING_SLOW_MS + 5_000))).toBe(true);
    expect(readingInFlight(queued(READING_SLOW_MS + 5_000))).toBe(true);
    expect(READING_STALE_MS).toBe(8 * 60 * 1000);
  });

  it("is never slow while a step runs, and a fresh heartbeat (Read again) clears it", () => {
    expect(
      readingSlow({ status: "running", started_at: at(10 * 60_000), heartbeat_at: at(0) } as never),
    ).toBe(false);
    expect(
      readingSlow({
        status: "queued",
        started_at: at(10 * 60_000),
        heartbeat_at: at(1_000),
      } as never),
    ).toBe(false);
  });
});

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === "__tests__" ? [] : tsxFiles(p);
    return p.endsWith(".tsx") ? [p] : [];
  });
}

describe("no JSX inside a template string", () => {
  it("finds no `$<Component` in any component or route", () => {
    const hits = tsxFiles(join(__dirname, "..", ".."))
      .filter((f) => /\$<[A-Z]/.test(readFileSync(f, "utf8")))
      .map((f) => f.replace(/^.*\/src\//, "src/"));
    expect(hits).toEqual([]);
  });
});
