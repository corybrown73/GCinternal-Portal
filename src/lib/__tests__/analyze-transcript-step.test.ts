import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The analyze_transcript job's one step: it hands the job's subject to the
 * same reading the panel runs, as the system actor, and returns the usage
 * and what was kept; a job without a subject fails before any model call.
 */
const h = vi.hoisted(() => ({
  analysis: { analyzeTranscript: vi.fn() },
}));

vi.mock("../transcript-analysis.server", () => h.analysis);

import {
  analyze,
  ANALYZE_TRANSCRIPT_STEPS,
  analyzeTranscriptSteps,
} from "../server/ai/steps/analyze-transcript";
import type { AiJobRow } from "../server/ai/jobs";

const IMPL = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const FILE = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const job = (over: Partial<AiJobRow> = {}): AiJobRow =>
  ({
    id: "job-1",
    kind: "analyze_transcript",
    deal_id: null,
    implementation_id: IMPL,
    subject_id: FILE,
    status: "running",
    step: "analyze",
    steps_done: [],
    trigger: "upload",
    requested_by: null,
    force: false,
    rerun_requested: false,
    source_hash: null,
    attempts: 0,
    max_attempts: 4,
    next_attempt_at: "",
    locked_at: null,
    lock_token: "lock",
    result: {},
    usage: {},
    last_error: null,
    created_at: "2026-10-08T10:00:00Z",
    updated_at: "2026-10-08T10:00:00Z",
    started_at: "2026-10-08T10:00:00Z",
    finished_at: null,
    ...over,
  }) as AiJobRow;

const ctx = { now: () => new Date("2026-10-08T10:05:00Z") };

beforeEach(() => {
  h.analysis.analyzeTranscript.mockReset();
});

describe("the analyze_transcript step", () => {
  it("is the kind's only step", () => {
    expect(ANALYZE_TRANSCRIPT_STEPS).toEqual(["analyze"]);
    expect(analyzeTranscriptSteps["analyze"]).toBe(analyze);
  });

  it("reads the job's file for its implementation as the system actor and returns usage and result", async () => {
    h.analysis.analyzeTranscript.mockResolvedValueOnce({
      attachmentTitle: "kickoff.txt",
      analysis: {
        readable: true,
        problem: null,
        summary: "Kickoff.",
        meeting_date: "2026-10-06",
        proposals: [],
      },
      proposalIds: ["p-1", "p-2"],
      usage: {
        input_tokens: 10,
        output_tokens: 5,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      },
    });
    const out = await analyze(job(), ctx);
    expect(h.analysis.analyzeTranscript).toHaveBeenCalledWith(IMPL, FILE, {
      actor: { type: "system" },
      jobId: "job-1",
    });
    expect(out.usage).toMatchObject({ input_tokens: 10, output_tokens: 5 });
    expect(out.result).toEqual({
      attachment_id: FILE,
      attachment_title: "kickoff.txt",
      readable: true,
      problem: null,
      proposals: 2,
      proposal_ids: ["p-1", "p-2"],
      meeting_date: "2026-10-06",
      summary: "Kickoff.",
    });
  });

  it("finishes, rather than fails, on a file the model could not read as a transcript", async () => {
    h.analysis.analyzeTranscript.mockResolvedValueOnce({
      attachmentTitle: "list.txt",
      analysis: {
        readable: false,
        problem: "This is a shopping list.",
        summary: "",
        meeting_date: null,
        proposals: [],
      },
      proposalIds: [],
      usage: null,
    });
    const out = await analyze(job(), ctx);
    expect(out.result).toMatchObject({
      readable: false,
      problem: "This is a shopping list.",
      proposals: 0,
    });
  });

  it("fails before any reading when the job names no file or no implementation", async () => {
    await expect(analyze(job({ subject_id: null }), ctx)).rejects.toThrow(
      /needs the uploaded file/,
    );
    await expect(analyze(job({ implementation_id: null }), ctx)).rejects.toThrow(
      /needs an implementation/,
    );
    expect(h.analysis.analyzeTranscript).not.toHaveBeenCalled();
  });

  it("lets a fault in the reading through, so the runner backs off and retries", async () => {
    h.analysis.analyzeTranscript.mockRejectedValueOnce(
      new Error("The transcript analysis failed: socket hang up."),
    );
    await expect(analyze(job(), ctx)).rejects.toThrow("socket hang up");
  });
});
