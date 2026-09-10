import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { readIntake } from "@/lib/intake-answers";
import { closeDateFor, timelineFor } from "@/lib/onboarding-plan";
import { loadPipelineStages } from "@/lib/pipeline-stages.server";
import { wonStage } from "@/lib/pipeline-stages";

import { audit } from "./audit";
import type { OnboardingDeckInput } from "./brief/onboarding-deck";

const db = () => supabaseAdmin as any;

/**
 * The onboarding deck, from the record.
 *
 * Everything on the six slides comes from something somebody typed or
 * chose: the close date from the stage history (or the intake, when a
 * person moved it), the first form from the library card they pointed at
 * or the file they uploaded, the tester from the intake, the lead from the
 * project. Nothing is inferred — a deck that guesses reads the guess aloud
 * to the customer.
 */
export async function buildOnboardingDeckInput(dealId: string): Promise<OnboardingDeckInput> {
  const { data: deal } = await db()
    .from("portal_accounts")
    .select("id,name,intake,customer_id,logo_path,se_owner_id,am_owner_id")
    .eq("id", dealId)
    .maybeSingle();
  if (!deal) throw new Error("Deal not found");

  const intake = readIntake(deal.intake);
  const [{ data: history }, stages] = await Promise.all([
    db().from("portal_stage_transitions").select("to_stage,occurred_at").eq("account_id", dealId),
    loadPipelineStages(),
  ]);
  const close = closeDateFor({
    intake,
    stageHistory: (history ?? []) as Array<{ to_stage: string; occurred_at: string }>,
    wonStageKey: wonStage(stages).key,
  });
  const timeline = timelineFor(intake, close.date);

  // The first form and what comes after it. An uploaded form wins: the
  // build starts from what they already run. Otherwise the library cards
  // they chose, in the order they chose them; the rest of their industry's
  // shelf fills the "next" slide when they chose fewer than four.
  const { listFormTemplates } = await import("@/lib/form-templates.server");
  const library = await listFormTemplates();
  const byId = new Map(library.map((t) => [t.id, t]));
  const chosen = intake.chosen_templates
    .map((id) => byId.get(id))
    .filter(Boolean) as typeof library;
  const industryKey = (intake.industry ?? "").trim().toLowerCase();
  const shelf = library.filter(
    (t) => industryKey && t.industry.trim().toLowerCase() === industryKey && !chosen.includes(t),
  );

  let firstForm: OnboardingDeckInput["firstForm"] = null;
  let next: typeof library = [];
  const uploaded = intake.uploaded_forms[0];
  if (uploaded) {
    firstForm = { name: displayName(uploaded.name), objective: null, source: "uploaded" };
    next = [...chosen, ...shelf];
  } else if (chosen[0]) {
    firstForm = { name: chosen[0].name, objective: chosen[0].description, source: "library" };
    next = [...chosen.slice(1), ...shelf];
  } else {
    next = shelf;
  }

  const { loadHandoffContext } = await import("./handoff-context");
  const context = await loadHandoffContext(dealId);
  const lead = context?.project?.lead ?? context?.deal.seOwner ?? context?.deal.amOwner ?? null;
  const team = {
    lead,
    accountManager: context?.deal.amOwner ?? null,
    solutionsEngineer: context?.deal.seOwner ?? null,
    champion: context?.deal.primaryContact.name
      ? { name: context.deal.primaryContact.name, role: context.deal.primaryContact.role }
      : null,
  };

  return {
    clientName: String(deal.name),
    industry: intake.industry,
    timeline,
    lead,
    fieldTester: intake.timeline.field_tester,
    team,
    firstForm,
    nextUseCases: next.slice(0, 3).map((t) => ({ name: t.name, objective: t.description })),
    clientLogo: await clientLogo(deal.logo_path as string | null),
  };
}

/** "daily-haul-ticket.pdf" → "Daily haul ticket". */
function displayName(fileName: string): string {
  const stem = fileName
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[-_]+/g, " ")
    .trim();
  return stem ? stem.charAt(0).toUpperCase() + stem.slice(1) : fileName;
}

async function clientLogo(path: string | null): Promise<string | null> {
  if (!path) return null;
  try {
    const { data, error } = await db().storage.from("customer-branding").download(path);
    if (error || !data) return null;
    const buf = Buffer.from(await data.arrayBuffer());
    if (buf.byteLength > 2_000_000) return null;
    const ext = path.split(".").pop()?.toLowerCase();
    const mime =
      ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "webp" ? "image/webp" : "image/png";
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

function safeName(s: string): string {
  return (
    s
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "account"
  );
}

const PPTX = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

/**
 * Render, store, file. The deck goes in the briefs bucket against the deal
 * (so it exists before there is a project), and is also filed on the
 * account's attachments when the project already does — that is where the
 * implementation team looks.
 */
export async function generateOnboardingDeck(
  actorProfileId: string | null,
  dealId: string,
): Promise<{ url: string; fileName: string; liveDate: string }> {
  const input = await buildOnboardingDeckInput(dealId);
  const { buildOnboardingDeckFile } = await import("./brief/onboarding-deck");
  const deck = await buildOnboardingDeckFile(input);

  const fileName = `${safeName(input.clientName)}-onboarding-plan.pptx`;
  const path = `${dealId}/onboarding/${Date.now()}-${fileName}`;
  const { error: uploadError } = await db()
    .storage.from("portal-briefs")
    .upload(path, deck, { contentType: PPTX, upsert: true });
  if (uploadError) throw new Error(`Could not store the deck: ${uploadError.message}`);

  const { data: deal } = await db()
    .from("portal_accounts")
    .select("customer_id")
    .eq("id", dealId)
    .maybeSingle();
  const { data: impl } = deal?.customer_id
    ? await db()
        .from("implementations")
        .select("id")
        .eq("customer_id", deal.customer_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null };
  if (impl?.id) {
    const { addAccountUpload } = await import("@/lib/attachments.server");
    await addAccountUpload({
      implementationId: impl.id,
      title: `Onboarding plan — ${input.clientName}`,
      kind: "deck",
      fileName,
      contentType: PPTX,
      dataBase64: Buffer.from(deck).toString("base64"),
      actorProfileId,
    });
  }

  await audit({
    actor_type: actorProfileId ? "user" : "system",
    actor_id: actorProfileId,
    action: "deck.onboarding_generated",
    entity_type: "account",
    entity_id: dealId,
    payload: { path, live_date: input.timeline.liveDate, filed: Boolean(impl?.id) },
  });

  const { data: signed, error: signError } = await db()
    .storage.from("portal-briefs")
    .createSignedUrl(path, 3600, { download: fileName });
  if (signError || !signed?.signedUrl) {
    throw new Error(`The deck was stored but could not be linked: ${signError?.message ?? ""}`);
  }
  return { url: signed.signedUrl, fileName, liveDate: input.timeline.liveDate };
}
