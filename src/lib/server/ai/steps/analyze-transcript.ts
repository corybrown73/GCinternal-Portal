import type { AiJobRow, StepFn } from "../jobs";

/**
 * The `analyze_transcript` job: one step. The job's `subject_id` is the
 * `account_files` row the transcript was uploaded as, `implementation_id`
 * the implementation it was uploaded to. The reading itself — context,
 * model call, the pending rows in `evidence_proposals` — is the same
 * `analyzeTranscript` the panel's inline path runs, as the system actor; a
 * retry simply reads again and replaces the pending rows. A file the model
 * could not read as a transcript finishes the job with `readable: false`
 * and the reason: reading it again would only say the same thing.
 */

export const ANALYZE_TRANSCRIPT_STEPS = ["analyze"] as const;

function subjectOf(job: AiJobRow): { implementationId: string; attachmentId: string } {
  if (!job.implementation_id) throw new Error("An analyze_transcript job needs an implementation");
  if (!job.subject_id) throw new Error("An analyze_transcript job needs the uploaded file");
  return { implementationId: job.implementation_id, attachmentId: job.subject_id };
}

export const analyze: StepFn = async (job) => {
  const { implementationId, attachmentId } = subjectOf(job);
  const { analyzeTranscript } = await import("../../../transcript-analysis.server");
  const r = await analyzeTranscript(implementationId, attachmentId, {
    actor: { type: "system" },
    jobId: job.id,
  });
  return {
    usage: r.usage ?? undefined,
    result: {
      attachment_id: attachmentId,
      attachment_title: r.attachmentTitle,
      readable: r.analysis.readable,
      problem: r.analysis.problem,
      proposals: r.proposalIds.length,
      proposal_ids: r.proposalIds,
      meeting_date: r.analysis.meeting_date,
      summary: r.analysis.summary,
    },
  };
};

export const analyzeTranscriptSteps: Record<string, StepFn> = { analyze };
