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

/*
 * `draft` runs after `analyze` and drafts the follow-up email onto the same
 * row. It never fails the job: a draft that fails is kept as a failed draft
 * with its reason, so the proposals stand and nobody is paged over an email.
 */
export const ANALYZE_TRANSCRIPT_STEPS = ["analyze", "draft"] as const;

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

/**
 * The follow-up email. An unreadable reading has no email to draft, so the
 * draft says so from the reading's own reason, without a model call.
 */
export const draftEmail: StepFn = async (job) => {
  const { implementationId, attachmentId } = subjectOf(job);
  if (job.result["readable"] === false) {
    const problem = typeof job.result["problem"] === "string" ? job.result["problem"] : null;
    const { unreadableDraft } = await import("../../../transcript-followup");
    return {
      result: {
        followup_email: unreadableDraft(
          problem ?? "That file could not be read as a meeting transcript.",
          new Date().toISOString(),
        ),
      },
    };
  }
  const { draftFollowupEmail } = await import("../../../transcript-followup.server");
  const r = await draftFollowupEmail(implementationId, attachmentId, { jobId: job.id });
  return {
    usage: r.usage ?? undefined,
    result: { followup_email: r.draft },
  };
};

export const analyzeTranscriptSteps: Record<string, StepFn> = { analyze, draft: draftEmail };
