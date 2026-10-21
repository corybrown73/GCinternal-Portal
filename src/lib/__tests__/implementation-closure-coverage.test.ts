import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Closed implementations must leave every active surface, and stay visible
 * where the record is history. This keeps that true as the code changes.
 *
 * Every source file that reads the implementations table must either filter
 * closed rows (it mentions closed_at), or be listed below with the reason it
 * may see them. A new query that is not on this list fails the build until
 * someone decides, on purpose, whether it is active work or a record.
 */
const ALLOWED: Record<string, string> = {
  "src/lib/activity.server.ts": "one implementation's activity feed, read by id",
  "src/lib/attachments.server.ts": "files on one implementation, read by id; files are preserved",
  "src/lib/calendar.server.ts": "one implementation's meetings, read by id",
  "src/lib/completion.server.ts":
    "completion record by id; complete_outcome is frozen by the database",
  "src/lib/conversation.server.ts": "one implementation's conversations, read by id",
  "src/lib/customer-delete.server.ts": "deleting a customer is a separate, explicit path",
  "src/lib/customer-email.server.ts":
    "one customer's implementation by id; the composer is hidden for a closed one",
  "src/lib/external-plan.server.ts": "customer plan link by key; closure does not change links",
  "src/lib/external-share.server.ts": "share links; closure does not change them",
  "src/lib/handoff.server.ts": "the CS handoff packet by id; closure never triggers handoff",
  "src/lib/hygiene.server.ts": "data hygiene on one record by id",
  "src/lib/plan.server.ts": "one implementation's plan by id",
  "src/lib/portal-plan.server.ts":
    "customer plan by portal key; the customer's home list excludes closed ones",
  "src/lib/search.server.ts": "search finds history; closed items stay findable",
  "src/lib/server/ai/jobs.ts": "AI reading of a deal; reading history is unaffected",
  "src/lib/server/customer-facing-name.ts": "customer-facing name lookup by id",
  "src/lib/server/deal-facts.ts": "deal facts by deal id; triage only reads open implementations",
  "src/lib/server/deal-sow.ts": "SOW document identity lookup",
  "src/lib/server/document-guard.server.ts": "document placement; files are preserved",
  "src/lib/server/external-viewer.ts": "customer share viewer; link behaviour is unchanged",
  "src/lib/server/handoff-context.ts": "handoff context by id",
  "src/lib/sf-integration.server.ts":
    "finds closed implementations so the sync refuses them (sf-ingest refuseClosed)",
  "src/lib/sow-analysis.server.ts": "SOW reading by id",
  "src/lib/stage-flow.server.ts":
    "one deal's stage flow by id; a closed stage is frozen by the database",
  "src/lib/templates.server.ts": "template usage reference",
  "src/lib/transcript-analysis.server.ts": "reading of one transcript, by implementation id",
  "src/lib/transcript-followup.server.ts":
    "follow-up email for one transcript, by implementation id",
  "src/lib/transcript-proposals.server.ts": "proposals for one implementation, by id",
  "src/routes/api/v1/implementations.ts":
    "read-back API returns closed records with their closure fields; writes are refused",
};

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name !== "__tests__") out.push(...sourceFiles(path));
    } else if (/\.(ts|tsx)$/.test(name)) {
      out.push(path);
    }
  }
  return out;
}

function unfilteredReaders(): string[] {
  const root = process.cwd();
  return sourceFiles(join(root, "src"))
    .map((p) => relative(root, p).split("\\").join("/"))
    .filter((rel) => {
      const text = readFileSync(join(root, rel), "utf8");
      return text.includes('from("implementations")') && !text.includes("closed_at");
    })
    .sort();
}

describe("every implementation reader either filters closed rows or is a deliberate exception", () => {
  const unfiltered = unfilteredReaders();

  it("has no new unfiltered implementation reader", () => {
    const unexplained = unfiltered.filter((f) => !(f in ALLOWED));
    expect(unexplained).toEqual([]);
  });

  it("has no stale exception: every listed file still reads implementations without filtering", () => {
    const stale = Object.keys(ALLOWED).filter((f) => !unfiltered.includes(f));
    expect(stale).toEqual([]);
  });

  it("gives a reason for every exception", () => {
    for (const [file, reason] of Object.entries(ALLOWED)) {
      expect(reason.trim().length, file).toBeGreaterThan(10);
    }
  });
});
