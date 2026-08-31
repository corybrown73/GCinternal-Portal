import { BRAND } from "@/lib/brand";
import type { SharedPlan } from "@/lib/shared-plan";

import { MARKS, openBrandedPdf, PDF_BODY_SOFT } from "@/lib/pdf-kit";

/**
 * The customer's project plan, as a PDF.
 *
 * WHY IT EXISTS ALONGSIDE THE PAGE. The plan link is live and is the better
 * place to work — a customer ticks their tasks there. But a plan also has to
 * survive being forwarded to somebody's boss, printed for a meeting, and
 * opened by a procurement team that will never click a link in an email.
 *
 * IT IS A SNAPSHOT AND SAYS SO. Unlike the completion record, this is NOT
 * frozen — it renders whatever the plan says at the moment it is downloaded,
 * which is why it is stamped with that moment and tells the reader the link is
 * the current version. A PDF that quietly claims to be live is how somebody
 * ends up working from a task list that changed three weeks ago.
 *
 * Same authorization as the page: the route resolves the share token, so a
 * revoked or passcode-protected link cannot be turned into a PDF by guessing
 * the URL. Chrome and type come from `pdf-kit`; this file only decides what
 * the document says.
 */
export async function renderPlanPdf(plan: SharedPlan, planUrl: string): Promise<Uint8Array> {
  const pdf = await openBrandedPdf({
    title: plan.customer_name,
    subtitle: plan.implementation_name,
    meta: `Stage: ${plan.stage_label}${
      plan.target_launch_date ? `   ·   Target launch: ${plan.target_launch_date}` : ""
    }`,
    dateFor: plan.generated_at,
  });

  pdf.line(
    `This is your plan as it stood on ${plan.generated_at.slice(0, 10)}. It changes as work moves — the live version, where you can tick things off, is at ${planUrl}`,
    { size: 9.5, style: "italic", color: BRAND.fg2, gap: 12 },
  );
  if (plan.stage_intent) {
    pdf.gap(6);
    pdf.line(plan.stage_intent, { size: 11, gap: 14 });
  }

  const open = plan.your_tasks.filter((t) => t.status !== "done");
  const done = plan.your_tasks.filter((t) => t.status === "done");

  pdf.section(
    "With you",
    open.length === 0
      ? "Nothing is waiting on you right now."
      : `${open.length} thing${open.length === 1 ? "" : "s"} waiting on you.`,
  );
  for (const task of open) {
    pdf.line(`${MARKS.open}  ${task.title}`, { size: 10.5, style: "bold" });
    if (task.detail)
      pdf.line(task.detail, { size: 9.5, color: PDF_BODY_SOFT, gap: 12, indent: 16 });
    const meta = [
      task.due_date ? `Due ${task.due_date}` : null,
      task.blocked_by.length ? `Waiting on: ${task.blocked_by.join(", ")}` : null,
    ].filter(Boolean);
    if (meta.length) {
      pdf.line(meta.join("   ·   "), { size: 8.5, color: BRAND.fg2, gap: 11, indent: 16 });
    }
    pdf.gap(3);
  }
  if (open.length === 0) pdf.line("—", { color: BRAND.fg2 });

  if (done.length) {
    pdf.section("Already done", `${done.length} completed.`);
    for (const task of done) {
      const who = task.completed_by ? ` — ${task.completed_by}` : "";
      const when = task.completed_at ? ` (${task.completed_at.slice(0, 10)})` : "";
      pdf.line(`${MARKS.done}  ${task.title}${who}${when}`, {
        size: 9.5,
        color: PDF_BODY_SOFT,
        gap: 12,
      });
    }
  }

  pdf.section("With us", "What GoCanvas has committed to.");
  if (plan.our_commitments.length === 0) {
    pdf.line("Nothing outstanding on our side.", { color: BRAND.fg2 });
  }
  for (const c of plan.our_commitments) {
    pdf.line(`${c.done ? MARKS.done : MARKS.open}  ${c.description}`, { size: 10.5 });
    const meta = [c.due_date ? `Due ${c.due_date}` : null, c.committed_to].filter(Boolean);
    if (meta.length) {
      pdf.line(meta.join("   ·   "), { size: 8.5, color: BRAND.fg2, gap: 11, indent: 16 });
    }
  }

  pdf.section("The road to launch");
  if (plan.milestones.length === 0) {
    pdf.line("No milestones have been set yet.", { color: BRAND.fg2 });
  }
  for (const m of plan.milestones) {
    const when = m.completed_date
      ? `done ${m.completed_date}`
      : m.target_date
        ? `target ${m.target_date}`
        : "no date set";
    pdf.line(`${m.name}  —  ${when}`);
  }

  pdf.section("Documents");
  if (plan.documents.length === 0) {
    pdf.line("No documents have been shared here yet.", { color: BRAND.fg2 });
  }
  for (const d of plan.documents) {
    pdf.line(`${d.file_name}   ·   shared ${d.uploaded_at.slice(0, 10)}`, {
      size: 9.5,
      color: PDF_BODY_SOFT,
      gap: 12,
    });
  }
  if (plan.documents.length) {
    pdf.line("Files are downloaded from the plan link, not from this PDF.", {
      size: 8.5,
      style: "italic",
      color: BRAND.fg2,
      gap: 11,
    });
  }

  if (plan.contact) {
    pdf.section("Who to ask");
    pdf.line([plan.contact.name, plan.contact.email].filter(Boolean).join("   ·   "));
  }

  return pdf.finish();
}
