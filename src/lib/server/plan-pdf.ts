import { BRAND, copyrightLine, rgb } from "@/lib/brand";
import type { SharedPlan } from "@/lib/shared-plan";

import { WORDMARK_WHITE } from "./brand-assets";

/**
 * The customer's project plan, as a PDF.
 *
 * WHY IT EXISTS ALONGSIDE THE PAGE. The plan link is live and is the better
 * place to work — a customer ticks their tasks there. But a plan also has to
 * survive being forwarded to somebody's boss, printed for a meeting, and
 * opened by a procurement team that will never click a link in an email. Those
 * are not the live plan's job.
 *
 * IT IS A SNAPSHOT AND SAYS SO. Unlike the completion record, this is NOT
 * frozen — it renders whatever the plan says at the moment it is downloaded,
 * which is why it is stamped with that moment and tells the reader the link is
 * the current version. A PDF that quietly claims to be live is how somebody
 * ends up working from a task list that changed three weeks ago.
 *
 * Same authorization as the page: the route resolves the share token, so a
 * revoked or passcode-protected link cannot be turned into a PDF by guessing
 * the URL. jsPDF in Node, text and rules only, like every other PDF here.
 */
export async function renderPlanPdf(plan: SharedPlan, planUrl: string): Promise<Uint8Array> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "letter" });

  const margin = 54;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const width = pageW - margin * 2;
  let y = margin;

  /**
   * jsPDF's built-in Helvetica is WinAnsi-encoded, and U+2610/U+2611 are not in
   * it — a ballot box came out as "&" on the first render. ASCII, so the marks
   * survive without embedding a font for two glyphs.
   */
  const BOX = "[ ]";
  const TICK = "[x]";

  const setColor = (value: string) => {
    const [r, g, b] = rgb(value);
    doc.setTextColor(r, g, b);
  };

  const room = (needed: number) => {
    if (y + needed > pageH - margin - 18) {
      footer();
      doc.addPage();
      y = margin;
    }
  };

  const footer = () => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    setColor(BRAND.grey);
    doc.text(copyrightLine(plan.generated_at), pageW - margin, pageH - 30, { align: "right" });
  };

  const line = (
    text: string,
    size = 10,
    style: "normal" | "bold" | "italic" = "normal",
    color = "1B2534",
    gap = 13,
    indent = 0,
  ) => {
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
    setColor(color);
    for (const part of doc.splitTextToSize(text, width - indent) as string[]) {
      room(gap);
      doc.text(part, margin + indent, y);
      y += gap;
    }
  };

  const section = (heading: string, note?: string) => {
    room(58);
    y += 8;
    const baseline = y;
    line(heading, 13.5, "bold", BRAND.navy, 17);
    // The cyan rule, exactly as the deck uses it: once, under the heading.
    // Positioned from the heading's own baseline, clear of the descenders.
    // Computing it from `y` after the write put the rule through the note
    // underneath; sitting it too close put it through the heading itself.
    const [cr, cg, cb] = rgb(BRAND.cyan);
    doc.setDrawColor(cr, cg, cb);
    doc.setLineWidth(2);
    doc.line(margin, baseline + 10, margin + 34, baseline + 10);
    doc.setLineWidth(0.5);
    y += 9;
    if (note) line(note, 9, "italic", BRAND.grey, 12);
    y += 3;
  };

  /* -------------------------------------------------------------- masthead */

  // The navy band the template opens on, at document scale.
  const [ir, ig, ib] = rgb(BRAND.ink);
  doc.setFillColor(ir, ig, ib);
  doc.rect(0, 0, pageW, 132, "F");
  // The white wordmark sits on the navy band; the navy variant is for the
  // white body, so the band uses the one that reads on it.
  doc.addImage(WORDMARK_WHITE, "PNG", pageW - margin - 78, 30, 78, 15);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(255, 255, 255);
  doc.text(plan.customer_name, margin, 62);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  const [ar, ag, ab] = rgb("A9B6C7");
  doc.setTextColor(ar, ag, ab);
  doc.text(plan.implementation_name, margin, 84);
  doc.setFontSize(9.5);
  doc.text(
    `Stage: ${plan.stage_label}${
      plan.target_launch_date ? `   ·   Target launch: ${plan.target_launch_date}` : ""
    }`,
    margin,
    104,
  );
  y = 162;

  line(
    `This is your plan as it stood on ${new Date(plan.generated_at).toISOString().slice(0, 10)}. It changes as work moves — the live version, where you can tick things off, is at ${planUrl}`,
    9.5,
    "italic",
    BRAND.grey,
    12,
  );

  if (plan.stage_intent) {
    y += 6;
    line(plan.stage_intent, 11, "normal", "1B2534", 14);
  }

  /* ----------------------------------------------------------------- tasks */

  const open = plan.your_tasks.filter((t) => t.status !== "done");
  const done = plan.your_tasks.filter((t) => t.status === "done");

  section(
    "With you",
    open.length === 0
      ? "Nothing is waiting on you right now."
      : `${open.length} thing${open.length === 1 ? "" : "s"} waiting on you.`,
  );
  for (const task of open) {
    room(30);
    line(`${BOX}  ${task.title}`, 10.5, "bold", "1B2534", 13);
    if (task.detail) line(task.detail, 9.5, "normal", "3C4757", 12, 16);
    const meta = [
      task.due_date ? `Due ${task.due_date}` : null,
      task.blocked_by.length ? `Waiting on: ${task.blocked_by.join(", ")}` : null,
    ].filter(Boolean);
    if (meta.length) line(meta.join("   ·   "), 8.5, "normal", BRAND.grey, 11, 16);
    y += 3;
  }
  if (open.length === 0) line("—", 10, "normal", BRAND.grey, 13);

  if (done.length) {
    section("Already done", `${done.length} completed.`);
    for (const task of done) {
      room(16);
      const who = task.completed_by ? ` — ${task.completed_by}` : "";
      const when = task.completed_at ? ` (${task.completed_at.slice(0, 10)})` : "";
      line(`${TICK}  ${task.title}${who}${when}`, 9.5, "normal", "3C4757", 12);
    }
  }

  /* ----------------------------------------------------------- commitments */

  section("With us", "What GoCanvas has committed to.");
  if (plan.our_commitments.length === 0) {
    line("Nothing outstanding on our side.", 10, "normal", BRAND.grey, 13);
  }
  for (const c of plan.our_commitments) {
    room(20);
    line(`${c.done ? TICK : BOX}  ${c.description}`, 10.5, "normal", "1B2534", 13);
    const meta = [c.due_date ? `Due ${c.due_date}` : null, c.committed_to].filter(Boolean);
    if (meta.length) line(meta.join("   ·   "), 8.5, "normal", BRAND.grey, 11, 16);
  }

  /* ------------------------------------------------------------ milestones */

  section("The road to launch");
  if (plan.milestones.length === 0) {
    line("No milestones have been set yet.", 10, "normal", BRAND.grey, 13);
  }
  for (const m of plan.milestones) {
    room(16);
    const when = m.completed_date
      ? `done ${m.completed_date}`
      : m.target_date
        ? `target ${m.target_date}`
        : "no date set";
    line(`${m.name}  —  ${when}`, 10, "normal", "1B2534", 13);
  }

  /* ------------------------------------------------------------- documents */

  section("Documents");
  if (plan.documents.length === 0) {
    line("No documents have been shared here yet.", 10, "normal", BRAND.grey, 13);
  }
  for (const d of plan.documents) {
    room(14);
    line(`${d.file_name}   ·   shared ${d.uploaded_at.slice(0, 10)}`, 9.5, "normal", "3C4757", 12);
  }
  if (plan.documents.length) {
    line(
      "Files are downloaded from the plan link, not from this PDF.",
      8.5,
      "italic",
      BRAND.grey,
      11,
    );
  }

  /* --------------------------------------------------------------- contact */

  if (plan.contact) {
    section("Who to ask");
    line(
      [plan.contact.name, plan.contact.email].filter(Boolean).join("   ·   "),
      10,
      "normal",
      "1B2534",
      13,
    );
  }

  footer();
  return new Uint8Array(doc.output("arraybuffer"));
}
