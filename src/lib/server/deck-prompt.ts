import { BRAND } from "@/lib/brand";
import { readIntake } from "@/lib/intake-answers";
import { RACI_RESPONSIBILITIES, TEMPLATE_FIELDS } from "@/lib/kickoff-fields";

import { loadHandoffContext } from "./handoff-context";
import { FIELD_GUIDE } from "./mcp";

/**
 * One prompt, ready to paste into Claude, that produces the kickoff deck's
 * content — with no API key and no MCP.
 *
 * WHY THIS EXISTS. Two ways to build the deck already exist: the app's own
 * synthesis (needs ANTHROPIC_API_KEY in production) and the MCP server
 * (needs a connector with a key). Both can be down, misconfigured, or
 * simply not set up on the laptop in the room. This is the way that cannot
 * fail: copy, paste into claude.ai, paste the answer back.
 *
 * IT CARRIES EVERYTHING. The transcript verbatim, the SOW's facts, the
 * intake answers, the project's plan if there is one, the field contract
 * the renderer accepts, and the design system's tokens — so a model that
 * decides to draw the deck itself draws it in the right colours, and a
 * model that returns field values returns names the portal recognises.
 *
 * The rules are the same ones the MCP states: leaving a field out is
 * always better than filling it with a guess, because the deck marks a
 * blank for the presenter and reads an invention aloud to the customer as
 * fact.
 */
export async function buildDeckPrompt(dealId: string): Promise<string> {
  const ctx = await loadHandoffContext(dealId);
  if (!ctx) throw new Error("Deal not found");

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: row } = await (supabaseAdmin as any)
    .from("portal_accounts")
    .select("intake")
    .eq("id", dealId)
    .maybeSingle();
  const intake = readIntake(row?.intake);

  const lines: string[] = [];
  const h = (s: string) => lines.push("", `## ${s}`, "");

  lines.push(
    `# Build the Client Kickoff Deck for ${ctx.deal.name}`,
    "",
    "You are helping a GoCanvas implementation lead prepare the deck that hands a newly closed customer from sales to onboarding. Everything you need is below: what the customer said on the calls, what was sold, what the intake found, and the exact fields the deck template accepts.",
    "",
    "**Your job:** read the facts, then return the field values for the template. Two rules:",
    "",
    "1. **Leaving a field out is always better than guessing.** An omitted field renders as a visible placeholder the presenter completes before the meeting. An invented one is read aloud to the customer as fact.",
    "2. **Read back what the customer said, not what we would like them to want.** Goals in their words. Names as the notes spell them. Roles as job titles, never departments.",
    "",
    "If you notice a gap that matters — no sponsor named, no measurable goal, no date — say so at the top of your answer before the fields.",
  );

  h("What the customer said — the calls, verbatim");
  if (ctx.callNotes.length === 0) {
    lines.push(
      "_No call notes have been uploaded for this deal. Anything about what the customer wants would be invention — say so rather than writing it._",
    );
  }
  for (const c of ctx.callNotes) {
    lines.push(`### ${c.title} (${c.kind}, ${c.recordedAt.slice(0, 10)})`, "", c.markdown, "");
  }
  if (ctx.notes.length) {
    lines.push("### Reviewed onboarding notes", "");
    for (const n of ctx.notes) lines.push(`- (${n.recordedAt.slice(0, 10)}) ${n.markdown}`);
  }

  h("What was sold");
  lines.push(
    `- Company: ${ctx.deal.name}${ctx.deal.domain ? ` (${ctx.deal.domain})` : ""}`,
    `- Stage: ${ctx.deal.stage}`,
    `- Products: ${ctx.deal.products.length ? ctx.deal.products.join(", ") : "not recorded"}`,
    `- ARR: ${ctx.deal.arr != null ? `$${ctx.deal.arr.toLocaleString()}` : "not recorded"}`,
    `- Primary contact: ${[ctx.deal.primaryContact.name, ctx.deal.primaryContact.role, ctx.deal.primaryContact.email].filter(Boolean).join(" · ") || "not recorded"}`,
    `- Account manager: ${ctx.deal.amOwner ?? "not assigned"}`,
    `- Solutions engineer: ${ctx.deal.seOwner ?? "not assigned"}`,
    "",
    "**SOW**",
    `- Reference: ${ctx.sow.reference ?? "not recorded"}`,
    `- Signed: ${ctx.sow.signedDate ?? "not recorded"}`,
    `- Value: ${ctx.sow.value != null ? `$${ctx.sow.value.toLocaleString()}` : "not recorded"}`,
    `- Document: ${ctx.sow.documentName ?? (ctx.sow.uploaded ? "uploaded" : "none")}`,
  );

  h("What the intake found");
  if (intake.forms_built === null) {
    lines.push("_The intake has not been run yet._");
  } else if (intake.forms_built) {
    lines.push(
      "- They already have forms built. Uploaded: " +
        (intake.uploaded_forms.map((f) => f.name).join(", ") || "nothing yet"),
      "- The first phase is about mapping what they have, not designing from scratch.",
    );
  } else {
    lines.push(
      "- They are starting fresh — no forms built.",
      `- Industry: ${intake.industry ?? "not recorded"}`,
      `- Company size: ${intake.company_size ?? "not recorded"}`,
      `- People in the field: ${intake.field_users ?? "not recorded"}`,
      `- The process today: ${intake.current_process ?? "not recorded"}`,
      intake.chosen_templates.length
        ? `- Starting points chosen from the form library: ${intake.chosen_templates.length}`
        : "- No starting points chosen from the library yet.",
    );
  }

  if (ctx.project) {
    h("The project, as it stands");
    lines.push(
      `- Name: ${ctx.project.name}`,
      `- Journey: ${ctx.project.journeyType ?? "not set"}`,
      `- Target launch: ${ctx.project.targetLaunchDate ?? "not set"}`,
      `- Implementation lead: ${ctx.project.lead ?? "not assigned"}`,
      `- Stages: ${ctx.project.stages.map((s) => s.name).join(" → ") || "none"}`,
    );
    if (ctx.project.openCustomerTasks.length) {
      lines.push("", "Open tasks for the customer:");
      for (const t of ctx.project.openCustomerTasks) lines.push(`- ${t.title} (${t.stage})`);
    }
    if (ctx.project.successCriteria.length) {
      lines.push("", "Success criteria recorded:");
      for (const c of ctx.project.successCriteria) {
        lines.push(`- ${c.description}${c.target ? ` — target ${c.target}` : ""}`);
      }
    }
    if (ctx.project.openRisks.length) {
      lines.push("", "Open risks:");
      for (const r of ctx.project.openRisks) {
        lines.push(`- ${r.title}${r.mitigation ? ` — ${r.mitigation}` : ""}`);
      }
    }
  }

  if (ctx.gaps.length) {
    h("Gaps the portal already knows about");
    for (const g of ctx.gaps) lines.push(`- ${g}`);
  }

  h("The sequencing rule the deck must hold");
  lines.push(
    "The form gets proven in the field before anything is connected to it. Field mapping is the whole of an integration, and it cannot be right until a crew has used the form on a real job. Phase 1: make the work easy (one workflow, one crew, real jobs). Phase 2: make the work visible. Phase 3: make the process connected. Any integration the customer mentioned belongs in phase 3 — say so early, so it is not pushed for in week two.",
  );

  h("The fields the template accepts");
  lines.push(
    "Return a JSON object keyed by these names. Use only names from this list; omit any you cannot support from the facts above.",
    "",
  );
  for (const g of FIELD_GUIDE) {
    lines.push(`**${g.group}** — ${g.note}`, "");
    lines.push("`" + g.fields.join("`, `") + "`", "");
  }
  lines.push(
    `The RACI table's five responsibilities are fixed: ${RACI_RESPONSIBILITIES.map((r) => `"${r}"`).join(", ")}. Fill the owner and support columns.`,
  );

  h("Design system, if you draw the deck yourself");
  lines.push(
    "The portal renders the deck from the field values. If you build a .pptx directly instead, use exactly these tokens — this is the GoCanvas design system and the deck must not drift from it.",
    "",
    "```",
    `Font:            ${BRAND.fontSans} (fallback ${BRAND.fontSansFallback})`,
    `Dark background: #${BRAND.navy900}   Title text on dark: #${BRAND.fgOnDark1}   Accent on dark: #${BRAND.fgOnDark2}`,
    `Light background: #${BRAND.white}    Headings: #${BRAND.fg1}   Body: #${BRAND.fg2}   Muted: #${BRAND.fg3}`,
    `Accent (eyebrows, KPIs): #${BRAND.blue500}   Deep accent: #${BRAND.navy700}   Card border: #${BRAND.ink100}`,
    `Success #${BRAND.success}  Warning #${BRAND.warning}  Danger #${BRAND.danger}`,
    `Hero gradient: ${BRAND.heroGradient.map((c) => `#${c}`).join(" → ")}`,
    "Slides 16:9. Eyebrow labels uppercase with letter-spacing. One title per slide, never an accent line under it. Section dividers are dark; content slides are light.",
    "```",
  );

  h("What to return");
  lines.push(
    "1. Any gaps that matter, in two or three lines.",
    "2. A single JSON object of field values, in a code block, keyed by the names above. Omit what you cannot support.",
    "",
    "The implementation lead pastes the JSON into the portal, which renders the deck in the design system and files it against the account.",
    "",
    `_Field names for reference (${TEMPLATE_FIELDS.length}): ${TEMPLATE_FIELDS.join(", ")}_`,
  );

  return lines.join("\n");
}
