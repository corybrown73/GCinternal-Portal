import type { BetaContentBlockParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";

import { supabaseAdmin } from "@/integrations/supabase/client.server";

import { readIntake } from "./intake-answers";
import { requireInternal } from "./presale.server";
import {
  catalogueForPrompt,
  normalizeProposal,
  sowPlanProposalSchema,
  type SowPlanProposal,
} from "./sow-plan";

/**
 * Read the deal's signed SOW and propose the services list.
 *
 * Read-only: nothing is written. The person applies the rows they accept
 * from the timeline panel, and the plan computes the dates from there.
 */

const BUCKET = "attachments";

const db = () => supabaseAdmin as any;

const SYSTEM_PROMPT = `You read a signed Statement of Work for GoCanvas, a mobile forms product, and return JSON only.

The implementation team runs every customer the same way: phase 1 is the first form, built with the customer over three training calls in fifteen business days, with up to two more forms alongside it. Everything else the customer bought is a SERVICE from the catalogue below, assigned to a phase. Phase 1 services run alongside the form from the kickoff call. Phase 2 opens once the first form is proven in the field; phase 3 opens when phase 2 is live. Services in the same phase run at the same time.

Your job is the reading, not the calendar:
- List every purchased service as a row using ONLY the catalogue kinds. Use the name the SOW uses ("QuickBooks Online", "Invoice PDF", "Job Safety Analysis form"). One row per distinct thing: three additional forms are three paid_form rows with their names, not one row.
- The FIRST form is not a service — it is phase 1 itself. Put its name in first_form and do not list it as a paid_form row. Every additional form build is a paid_form row.
- Phases: paid_form, data_load and training rows are ALWAYS phase 1 — they run alongside the first form from the kickoff call, two or three forms at once is normal. integration, custom_pdf, analytics and other rows are phase 2 unless the SOW clearly sequences one after another purchased item, in which case phase 3.
- tier: integrations only, from the tiers below, by the complexity the SOW describes. weeks: only when the SOW states a duration for that item, else null. needs: only when the SOW names something the customer must provide for that item, else null.
- evidence: a short verbatim quote for each row when one exists. confidence: "stated" when the SOW says it plainly, "implied" when it is a reasonable reading, "uncertain" when thin.
- seats: the licensed user count when stated, else null.
- The SOW's OWN FACTS go in their own fields, as data: reference (the quote or SOW number as printed), signed_date, start_date (the day work begins, when the SOW names one), value (total contract value as a number), contact (the customer contact it names). ISO dates, YYYY-MM-DD. Null when the document does not say. These are the only calendar dates you output.
- Never put a schedule in the rows: the plan computes every milestone date from the start. A duration the SOW states for one item goes in that row's weeks.
- notes: exclusions, conditions, deadlines the customer must hit, anything the SOW says that a services list cannot hold. Do NOT repeat the reference, the signed date, the start date, the value or the contact here — they have their own fields. gaps: what the SOW leaves unsaid that the plan needs (which system, how many forms, who owns the mapping).
- dates: every calendar date the SOW PRINTS that the plan has to respect, typed: {"type":"deadline"|"start"|"signed"|"absence","date":"YYYY-MM-DD","end":null,"who":null,"quote":"the sentence as printed"}. A go-live or production date the customer must hit is a deadline. Only when the document prints a day: "end of October" or "Q4" is a note, not a date — never turn a month or a season into a day. Empty when it prints none.
- Never invent a service the SOW does not support. Fewer rows, well grounded, beats a full list.
- If the document is not a SOW, is empty or unreadable, set readable=false, explain in problem, and leave services empty.

${catalogueForPrompt()}

Return JSON exactly in this shape:
{"readable":true,"problem":null,"reference":null,"signed_date":null,"start_date":null,"value":null,"contact":null,"summary":"","first_form":null,"seats":null,"services":[{"kind":"integration","name":"","tier":3,"weeks":null,"phase":2,"needs":null,"evidence":null,"confidence":"stated"}],"notes":[],"gaps":[],"dates":[]}`;

export async function proposePlanFromSow(
  userId: string,
  dealId: string,
): Promise<{ sowName: string | null; proposal: SowPlanProposal; stamped: string[] }> {
  await requireInternal(userId);

  const { data: deal } = await db()
    .from("portal_accounts")
    .select("id,sow_document_path,sow_document_name")
    .eq("id", dealId)
    .maybeSingle();
  if (!deal) throw new Error("Deal not found");
  if (!deal.sow_document_path) {
    throw new Error("Upload the signed SOW first — the plan is read from that document.");
  }
  const { aiConfigured } = await import("./server/ai/config");
  if (!aiConfigured()) {
    throw new Error("AI reading is not configured here — an admin can check Admin → Integrations.");
  }

  const download = await db()
    .storage.from(BUCKET)
    .download(deal.sow_document_path as string);
  if (download.error || !download.data) throw new Error("Could not open the attached SOW.");

  // Sniffed, not assumed: a Word file is read as text, a PDF as a PDF, and
  // a file that is neither says why it was not read.
  const { prepareDocument } = await import("./server/ai/documents");
  const sow = await prepareDocument(
    new Uint8Array(await download.data.arrayBuffer()),
    (deal.sow_document_name as string | null) ?? "the attached SOW",
    null,
    { title: "Signed Statement of Work" },
  );
  if (!sow.block) throw new Error(sow.problem ?? "The attached SOW could not be read.");

  const content: BetaContentBlockParam[] = [
    sow.block,
    {
      type: "text",
      text: "Read this Statement of Work and return the JSON described in the system message. Ground every row in the document.",
    },
  ];

  const { runStructured, describeAiError } = await import("./server/ai/client");
  let proposal: SowPlanProposal;
  try {
    // A SOW is where a service gets mistaken for a form or a phase gets
    // wrong: room to reason through it is worth the tokens.
    const result = await runStructured({
      kind: "sow_plan",
      schema: sowPlanProposalSchema,
      system: [{ type: "text", text: SYSTEM_PROMPT }],
      content,
      maxTokens: 32000,
      dealId,
    });
    proposal = result.data;
  } catch (e) {
    console.error("[sow-plan] the reading failed", e);
    throw new Error(`${describeAiError(e, "Reading the SOW")} Nothing has been changed.`);
  }
  proposal = normalizeProposal(proposal);
  if (!proposal.readable) {
    throw new Error(
      proposal.problem ??
        "The attached document could not be read as a Statement of Work — set the plan by hand.",
    );
  }

  // The signed document's own facts, onto the record: the reference, the
  // dates, the value and the contact. Blanks only — a person's entry stands
  // — so the Statement of work card stops saying "nothing recorded" while
  // holding the PDF that states all of it.
  const stamped = await stampSowFacts(dealId, proposal);

  const { audit } = await import("./server/audit");
  await audit({
    actor_type: "user",
    actor_id: userId,
    action: "sow_plan.proposed",
    entity_type: "account",
    entity_id: dealId,
    payload: { services: proposal.services.length, seats: proposal.seats, stamped },
  });

  return { sowName: (deal.sow_document_name as string | null) ?? null, proposal, stamped };
}

/**
 * Write what the SOW states onto the columns the rest of the app reads:
 * the reference, the signed date, the value, the named contact, and the
 * start date as the plan's day 0. Only blanks are filled. Never throws —
 * the reading is the point, and a column that could not be written is
 * reported, not fatal.
 */
async function stampSowFacts(dealId: string, p: SowPlanProposal): Promise<string[]> {
  const stamped: string[] = [];
  try {
    const { data: deal } = await db()
      .from("portal_accounts")
      .select(
        "sow_reference,sow_signed_date,sow_value,primary_contact_name,primary_contact_role,primary_contact_email,intake,arr",
      )
      .eq("id", dealId)
      .maybeSingle();
    if (!deal) return stamped;
    const patch: Record<string, unknown> = {};
    const set = (col: string, value: unknown, label: string) => {
      if (value === null || value === undefined || value === "") return;
      if ((deal as Record<string, unknown>)[col]) return;
      patch[col] = value;
      stamped.push(label);
    };
    set("sow_reference", p.reference, "reference");
    set("sow_signed_date", p.signed_date, "signed date");
    set("sow_value", p.value, "value");
    // An add-on deal is worth what its own SOW says. It never inherits the
    // customer's ARR, and the pipeline's total counts it once.
    if (readIntake(deal.intake).path === "existing") set("arr", p.value, "ARR");
    set("primary_contact_name", p.contact?.name ?? null, "contact");
    set("primary_contact_role", p.contact?.role ?? null, "contact role");
    set("primary_contact_email", p.contact?.email ?? null, "contact email");

    // The plan's day 0: the SOW's start date when it names one, else its
    // signed date. Without this every plan starts "as if today".
    const day0 = p.start_date ?? p.signed_date;
    if (day0 && /^\d{4}-\d{2}-\d{2}$/.test(day0)) {
      const intake = readIntake((deal as { intake?: unknown }).intake);
      if (!intake.timeline.close_date) {
        // Merged into intake.timeline, never the whole intake written back:
        // the brief may be filling the rest of it at this very moment.
        const { mergeIntake } = await import("./server/intake-merge");
        await mergeIntake(dealId, {}, { close_date: day0 });
        stamped.push("start date");
      }
    }
    if (Object.keys(patch).length === 0) return stamped;
    patch["updated_at"] = new Date().toISOString();
    const { error } = await db().from("portal_accounts").update(patch).eq("id", dealId);
    if (error) {
      console.error("[sow-plan] could not stamp the SOW facts", error.message);
      return [];
    }
  } catch (e) {
    console.error("[sow-plan] could not stamp the SOW facts", e);
    return [];
  }
  return stamped;
}
