import { describe, expect, it, vi } from "vitest";

import { functionalRecordedWarning, graduationNote } from "../adjust-plan-notes";
import { guideSteps } from "../deal-guide";
import { handoffCompleteness, type HandoffInputs } from "../handoff-completeness";
import { readIntake } from "../intake-answers";
import { invalidatePaperwork, paperworkQueryKeys } from "../paperwork-cache";
import { stageFlow } from "../stage-flow";
import {
  hasSowOnFile,
  missingForClosedWon,
  paperworkOnFile,
  paperworkSummary,
  WON_GATE_LABEL,
  type PaperworkOnFile,
} from "../won-gate";

/**
 * Paperwork on file, by one rule: a SOW (uploaded, linked or referenced),
 * or the signed contract, or a written reason there is no SOW. Every
 * reader asks the rule, so no screen says "SOW missing" while another
 * says it is in.
 */

const CONTRACT = { path: "deals/d/contract/c.pdf", name: "c.pdf", uploaded_at: "2026-10-01" };

describe("paperworkOnFile — every combination", () => {
  const paths = [null, "", "deals/d/sow.pdf"];
  const urls = [null, "  ", "https://docusign.example/sow"];
  const refs = [null, "   ", "SOW-2026-0114"];
  const contracts = [null, { path: "", name: "x", uploaded_at: "" }, CONTRACT];
  const hasSows = [null, true, false];
  const reasons = [undefined, null, "  ", "Three seats on an order form"];

  /** The rule, written out independently of the code under test. */
  const expected = (c: {
    path: string | null;
    url: string | null;
    ref: string | null;
    contract: { path: string } | null;
    hasSow: boolean | null;
    reason: string | null | undefined;
  }): PaperworkOnFile | null => {
    const set = (v: string | null | undefined) => typeof v === "string" && v.trim().length > 0;
    if (set(c.path) || set(c.url) || set(c.ref)) return "sow";
    if (c.contract && set(c.contract.path)) return "contract";
    if (c.hasSow === false && set(c.reason)) return "no_sow";
    return null;
  };

  it("matches the rule for all of them", () => {
    let checked = 0;
    for (const path of paths)
      for (const url of urls)
        for (const ref of refs)
          for (const contract of contracts)
            for (const hasSow of hasSows)
              for (const reason of reasons) {
                const intake: Record<string, unknown> = { has_sow: hasSow, contract };
                if (reason !== undefined) intake["no_sow_reason"] = reason;
                const got = paperworkOnFile({
                  sow_document_path: path,
                  sow_document_url: url,
                  sow_reference: ref,
                  intake,
                });
                const want = expected({ path, url, ref, contract, hasSow, reason });
                expect(got, JSON.stringify({ path, url, ref, contract, hasSow, reason })).toBe(
                  want,
                );
                // The yes/no alias agrees with it.
                expect(
                  hasSowOnFile({
                    sow_document_path: path,
                    sow_document_url: url,
                    sow_reference: ref,
                    intake,
                  }),
                ).toBe(want !== null);
                checked++;
              }
    expect(checked).toBe(3 * 3 * 3 * 3 * 3 * 4);
  });

  it("reads a read intake the same as the raw jsonb, and tolerates no intake at all", () => {
    const raw = { has_sow: false, no_sow_reason: "No services sold" };
    expect(paperworkOnFile({ intake: raw })).toBe("no_sow");
    expect(paperworkOnFile({ intake: readIntake(raw) })).toBe("no_sow");
    expect(paperworkOnFile({ intake: readIntake({ contract: CONTRACT }) })).toBe("contract");
    expect(paperworkOnFile({})).toBeNull();
    expect(paperworkOnFile({ intake: null })).toBeNull();
    expect(paperworkOnFile({ intake: "junk" })).toBeNull();
    // A reason without "No" is not a stated no-SOW.
    expect(paperworkOnFile({ intake: { has_sow: null, no_sow_reason: "why" } })).toBeNull();
    expect(paperworkOnFile({ intake: { has_sow: true, no_sow_reason: "why" } })).toBeNull();
  });

  it("names each kind for a checklist line", () => {
    expect(paperworkSummary("sow")).toBe("SOW on file");
    expect(paperworkSummary("contract")).toBe("Contract on file");
    expect(paperworkSummary("no_sow", { no_sow_reason: " Order form only " })).toBe(
      "No SOW: Order form only",
    );
    expect(paperworkSummary("no_sow")).toBe("No SOW");
    expect(paperworkSummary(null)).toBeNull();
  });
});

describe("the Closed Won gate is unchanged until 0087", () => {
  it("still asks for the SOW's document or reference: a contract does not clear it yet", () => {
    // The database gate (0070) refuses a contract-only deal; the app must
    // not let one through only to be refused below.
    expect(missingForClosedWon({ reports: 1, sowPath: null, sowReference: null })).toEqual(["sow"]);
    expect(missingForClosedWon({ reports: 1, sowPath: "x.pdf", sowReference: null })).toEqual([]);
  });

  it("does not claim a contract counts", () => {
    expect(WON_GATE_LABEL.sow).toBe("signed SOW");
    expect(WON_GATE_LABEL.sow).not.toMatch(/contract/);
  });
});

describe("the readers ask the rule", () => {
  const ready = {
    path: "new_logo",
    forms_built: false,
    wanted_forms: [{ id: "f1", name: "Daily job report", template_id: null }],
    handoff_tasks: { reviewed: "2026-09-22T15:00:00Z" },
  };
  const sowTask = (intake: unknown, paperwork: PaperworkOnFile | null) =>
    stageFlow({
      stage: "closed_won",
      intake,
      owner: "Dana",
      gongReports: 1,
      paperwork,
      hasBrief: true,
      hasLink: true,
    })
      .stages.find((s) => s.key === "closed_won")!
      .tasks.find((t) => t.key === "sow")!;

  it("the checklist: a contract-only deal and a stated reason both tick 'Add the SOW'", () => {
    const contractOnly = { ...ready, has_sow: false, contract: CONTRACT };
    expect(sowTask(contractOnly, paperworkOnFile({ intake: contractOnly }))).toMatchObject({
      done: true,
      summary: "Contract on file",
    });
    const linked = { sow_document_url: "https://drive.example/sow", intake: ready };
    expect(sowTask(ready, paperworkOnFile(linked))).toMatchObject({
      done: true,
      summary: "SOW on file",
    });
    const bare = { ...ready, has_sow: false };
    expect(sowTask(bare, paperworkOnFile({ intake: bare })).done).toBe(false);
  });

  it("the deal guide: an upload ticks 'SOW or contract on file' with no Yes/No click", () => {
    const paper = (intake: unknown, paperwork?: PaperworkOnFile | null) =>
      guideSteps({
        intake,
        gongReports: 1,
        aiBriefs: 1,
        hasSow: false,
        ...(paperwork !== undefined ? { paperwork } : {}),
        shareUrl: null,
        stageHistory: [],
        wonStageKey: "closed_won",
        today: "2026-10-16",
      }).find((s) => s.key === "paper")!;
    // A SOW uploaded on the customer page, has_sow never answered.
    expect(paper({}, "sow").done).toBe(true);
    // The contract, read from the intake when the caller passes nothing.
    expect(paper({ has_sow: false, contract: CONTRACT }).done).toBe(true);
    expect(paper({ has_sow: false, no_sow_reason: "Order form only" }).done).toBe(true);
    const bare = paper({ has_sow: false });
    expect(bare.done).toBe(false);
    expect(bare.hint).toMatch(/or say why there is no SOW/);
  });

  it("the Customer 360 handoff check: the deal's paperwork, and a SOW at sow_document_path", () => {
    const base: HandoffInputs = {
      implementation: {},
      packet: {},
      successCriteria: [],
      contacts: [],
      commitments: [],
      risks: [],
      gongReports: [],
    };
    const sowItem = (inputs: HandoffInputs) =>
      handoffCompleteness(inputs).items.find((i) => i.key === "sow_link")!;
    expect(sowItem(base).present).toBe(false);
    // A SOW uploaded on the deal lands on the implementation's sow_document_path.
    expect(
      sowItem({ ...base, implementation: { sow_document_path: "deals/d/sow.pdf" } }).present,
    ).toBe(true);
    expect(sowItem({ ...base, paperwork: "contract" })).toMatchObject({
      present: true,
      detail: "No SOW: the signed contract is on the deal.",
    });
    expect(sowItem({ ...base, paperwork: "no_sow" }).present).toBe(true);
    expect(sowItem({ ...base, paperwork: null }).detail).toBe(
      "No SOW document, reference or contract on the implementation or its deal.",
    );
  });
});

describe("no_sow_reason on the intake", () => {
  it("is read and kept, and is optional", () => {
    expect(readIntake({ has_sow: false, no_sow_reason: "Why" }).no_sow_reason).toBe("Why");
    expect(readIntake({}).no_sow_reason).toBeUndefined();
    expect(readIntake({ no_sow_reason: null }).no_sow_reason).toBeNull();
  });
});

describe("Adjust plan dates: the graduation line and the Functional warning", () => {
  it("says which graduation the customer sees, and that a milestone move never sets it", () => {
    expect(graduationNote(readIntake({}))).toBe(
      "Target graduation (what the customer sees): Not agreed yet. Moving a plan milestone never sets it.",
    );
    const agreed = readIntake({
      timeline: {
        stage_targets: { complete: { original_date: "2026-11-20", current_date: "2026-11-20" } },
      },
    });
    expect(graduationNote(agreed)).toMatch(
      /^Target graduation \(what the customer sees\): .*Nov 20\. Moving a plan milestone never sets it\.$/,
    );
  });

  it("warns when the moved milestone lands after an already-recorded Functional", () => {
    expect(
      functionalRecordedWarning({
        liveDoneOn: "2026-09-22",
        milestoneLabel: "Stage 3 — Make it run",
        newDate: "2026-10-20",
      }),
    ).toMatch(
      /^Functional is already recorded on .*Sep 22; this moves only Stage 3 — Make it run\. Later dates do not move\.$/,
    );
    // Not ticked, or landing on or before it: nothing to warn about.
    expect(
      functionalRecordedWarning({ liveDoneOn: null, milestoneLabel: "X", newDate: "2026-10-20" }),
    ).toBeNull();
    expect(
      functionalRecordedWarning({
        liveDoneOn: "2026-09-22",
        milestoneLabel: "X",
        newDate: "2026-09-22",
      }),
    ).toBeNull();
    expect(
      functionalRecordedWarning({ liveDoneOn: "2026-09-22", milestoneLabel: "X", newDate: "" }),
    ).toBeNull();
  });
});

describe("the cache after a SOW or contract lands", () => {
  it("refreshes the deal, its pulse, the customer page, Home and the welcome page", async () => {
    expect(paperworkQueryKeys("d1")).toEqual([
      ["deal", "d1"],
      ["deal-pulse", "d1"],
      ["welcome", "d1"],
      ["customer360"],
      ["home"],
      ["pipeline"],
    ]);
    expect(paperworkQueryKeys(null)).toEqual([
      ["deal"],
      ["deal-pulse"],
      ["welcome"],
      ["customer360"],
      ["home"],
      ["pipeline"],
    ]);
    const qc = { invalidateQueries: vi.fn(async () => undefined) };
    await invalidatePaperwork(qc, "d1");
    expect(qc.invalidateQueries.mock.calls.map((c) => (c as any)[0].queryKey)).toEqual(
      paperworkQueryKeys("d1"),
    );
  });
});
