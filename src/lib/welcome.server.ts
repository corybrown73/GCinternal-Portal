import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { looksInternal } from "./names";

import { readIntake } from "./intake-answers";
import { appUrl } from "@/lib/app-url";
import { industryIcon } from "@/lib/industry-icons";
import {
  customerHomeworkView,
  customerIntakeView,
  customerWelcomeView,
  HOMEWORK_KEYS,
  implementationFocusFallbackView,
  implementationFocusView,
  workflowStoryView,
  type HomeworkKey,
  type WelcomeView,
} from "@/lib/welcome";
import { kickoffFocusContent } from "@/lib/kickoff-view";
import { purchasedSolutionsFor } from "./purchased-solutions";

import { audit } from "./server/audit";
import { hashToken } from "./server/plan-tokens";
import {
  enforceRateLimit,
  takeRateLimit,
  WELCOME_CLICK_LIMIT,
  WELCOME_READ_LIMIT,
  WELCOME_WRITE_LIMIT,
} from "./server/rate-limit";

const db = () => supabaseAdmin as any;

/**
 * The welcome page: the onboarding plan as a page the customer holds.
 *
 * ONE SOURCE. The page reads the same input the PowerPoint does
 * (buildOnboardingDeckInput), so a date moved on the deal is moved on the
 * customer's page, in the presentation and in the PDF at once. There is no
 * "regenerate" — the page is always current.
 *
 * ONE TOKEN PER DEAL, hashed at rest like every token in this app. The raw
 * value exists in the URL the customer holds and nowhere else. Rotating
 * issues a new one and the old link dies. Clearing revokes.
 *
 * THE PUBLIC WRITE is one column: welcome_homework. The token authorises
 * ticking a box on the customer's own page and nothing else on the row.
 */

const TOKEN_PREFIX = "gcwl_";

/**
 * Per-token budgets on the public reads and writes (server/rate-limit.ts).
 * Best-effort: in memory, per server instance. Keyed by the token's hash,
 * never the raw token.
 */
function limitLink(token: string, kind: "read" | "click" | "write"): void {
  enforceRateLimit(
    `welcome:${kind}:${hashToken(token)}`,
    kind === "read"
      ? WELCOME_READ_LIMIT
      : kind === "click"
        ? WELCOME_CLICK_LIMIT
        : WELCOME_WRITE_LIMIT,
  );
}

function shareUrlFor(token: string): string {
  return `${appUrl()}/welcome/${token}`;
}

async function viewFor(
  deal: any,
  opts: { internal: boolean; token?: string | null },
): Promise<WelcomeView> {
  const { buildOnboardingDeckInput } = await import("./server/onboarding-deck-generate");
  const input = await buildOnboardingDeckInput(deal.id);
  const { photoForIndustry } = await import("./industry-photos.server");
  const { toolMarkUrls } = await import("./tool-marks.server");
  const [photoUrl, toolMarks] = await Promise.all([
    photoForIndustry(input.industry, String(deal.id)),
    toolMarkUrls(),
  ]);

  let clientLogoUrl: string | null = null;
  if (deal.logo_path) {
    const { data } = await db()
      .storage.from("customer-branding")
      .createSignedUrl(deal.logo_path, 60 * 60);
    clientLogoUrl = data?.signedUrl ?? null;
  }

  const homework = (deal.welcome_homework ?? {}) as Record<string, unknown>;
  const homeworkDone: Record<string, string> = {};
  for (const k of HOMEWORK_KEYS) {
    if (typeof homework[k] === "string") homeworkDone[k] = homework[k] as string;
  }

  // The lead's email: the owner whose name matches the lead, else the SE,
  // else the AM. The closing screen says who to write to, not just who.
  let leadEmail: string | null = null;
  const ownerIds = [deal.se_owner_id, deal.am_owner_id].filter(Boolean);
  if (ownerIds.length) {
    const { data: owners } = await db()
      .from("portal_profiles")
      .select("id,full_name,email")
      .in("id", ownerIds);
    const rows = (owners ?? []) as Array<{
      id: string;
      full_name: string | null;
      email: string | null;
    }>;
    const byName = rows.find((r) => r.full_name && r.full_name === input.lead);
    const se = rows.find((r) => r.id === deal.se_owner_id);
    const am = rows.find((r) => r.id === deal.am_owner_id);
    leadEmail = byName?.email ?? se?.email ?? am?.email ?? null;
  }

  // The person leading this one: the assignment first, then the plan's lead
  // by name, then the owners. Their photo and booking link come with them.
  const { leadCardForDeal } = await import("./team-profile.server");
  const leadCard = await leadCardForDeal(
    { id: String(deal.id), se_owner_id: deal.se_owner_id, am_owner_id: deal.am_owner_id },
    input.lead,
  );
  const leadName = leadCard?.name ?? input.lead;
  if (leadCard?.email) leadEmail = leadCard.email;
  const { bookingShown } = await import("./welcome");
  const intake = readIntake(deal.intake);
  const bookingOn = bookingShown(intake.welcome_hidden_screens);
  const formArtifacts: WelcomeView["formArtifacts"] = [];
  if (opts.internal && intake.uploaded_forms.length) {
    const { intakeFormLink } = await import("./presale.server");
    const linked = await Promise.all(
      intake.uploaded_forms.map(async (form) => {
        try {
          const { url } = await intakeFormLink(String(deal.id), form.path);
          return { name: form.name, url };
        } catch (error) {
          console.error("[welcome] could not sign an uploaded form", error);
          return null;
        }
      }),
    );
    formArtifacts.push(...linked.filter((form): form is { name: string; url: string } => !!form));
  }

  const readiness: WelcomeView["readiness"] = [];
  if (opts.internal) {
    // The name on the cover is the first thing they read. An opportunity
    // name — "SUNSOURCEHOLDINGS-DR NL" — is ours, not theirs.
    if (!deal.display_name && looksInternal(deal.name))
      readiness.push({
        key: "name",
        label: `Customer-facing name — the deal is named "${deal.name}"`,
        hint: "Deal → Customer-facing name. Everything the customer sees uses it.",
      });
    if (!input.industry)
      readiness.push({
        key: "industry",
        label: "Industry",
        hint: "Onboarding intake → industry. Picks the icon, the phone's fields and the photo.",
      });
    if (!input.firstForm && !input.timeline.training)
      readiness.push({
        key: "form",
        label: "First form",
        hint: "Onboarding intake → pick a library card or upload what they have.",
      });
    else if (input.firstForm && input.firstFormSource === "ai")
      readiness.push({
        key: "form_words",
        label: "First form — confirm it",
        hint: "Onboarding intake → the forms they named. The AI reading took this one from the SOW or the calls; the cover and the phone show it as “to confirm” until you change it or pick it yourself.",
      });
    if (!input.currentProcess)
      readiness.push({
        key: "process",
        label: "The process today, in their words",
        hint: "Onboarding intake → the process today. It is the 'now' on screen five.",
      });
    else if (input.currentProcessSource === "ai")
      readiness.push({
        key: "process_words",
        label: "The process today — confirm it is their words",
        hint: "Onboarding intake → the brief wrote this line from the call notes. Retype it as they said it, or press “These are their words”. Until then the page shows it without quotation marks.",
      });
    const story = readIntake(deal.intake).workflow_story;
    if ((story.before || story.during || story.after) && !story.validated_at)
      readiness.push({
        key: "story",
        label: "The workflow story — confirm it is their words",
        hint: "Customer 360 → Current Implementation → Workflow story. The AI reading drafted it from the calls; Kickoff View shows it as “to confirm” until you confirm or retype it.",
      });
    if (!input.team?.champion)
      readiness.push({
        key: "champion",
        label: "Their project owner",
        hint: "Deal → contact name and role. Named on the team screen.",
      });
    if (!input.fieldTester)
      readiness.push({
        key: "tester",
        label: "Their field tester",
        hint: "Onboarding plan → field tester. The most important name on the page.",
      });
    else if (input.fieldTesterSource === "ai")
      readiness.push({
        key: "tester_words",
        label: "Their field tester — confirm it",
        hint: "Onboarding plan → field tester. The AI reading proposed this name from the calls; the page shows it as “to confirm” until you retype it (or correct it) as theirs.",
      });
    if (!leadName)
      readiness.push({
        key: "lead",
        label: "Our onboarding lead",
        hint: "Deal → SE or AM owner, or the project's lead once it exists.",
      });
    if (leadName && !leadCard?.photoUrl)
      readiness.push({
        key: "leadcard",
        label: `${leadName}'s photo`,
        hint: "Settings → My profile. The team screen shows the face.",
      });
    // The booking link is asked for only when it is switched on for this
    // customer; off is the default, and off is not a gap.
    if (leadName && bookingOn && !leadCard?.bookingUrl)
      readiness.push({
        key: "booking",
        label: `${leadName}'s booking link`,
        hint: "Settings → My profile, or switch the booking link off in the Screens list.",
      });
    if (!photoUrl)
      readiness.push({
        key: "photo",
        label: `A photo for ${input.industry ?? "the industry"}`,
        hint: "Admin → Industry photos. The icon composition stands in until then.",
      });
    const calls = input.timeline.milestones.filter((m) => m.kind === "call");
    if (calls.some((m) => !m.time))
      readiness.push({
        key: "times",
        label:
          calls.length === 1 ? "A time for the walkthrough" : `Times for all ${calls.length} calls`,
        hint: "Book the meetings on the checklist (or set the times on the plan), then send the invites.",
      });
  }

  const lot = await parkingLotFor(String(deal.id));
  const stageTransitions = await stageTransitionsForDeal(String(deal.id));
  const railStatuses = await railStatusesForDeal(String(deal.id));
  // A partner deal's dashboard comes from its partner progress. If that cannot
  // load for a known partner, the dashboard says so; a standard deal is unaffected.
  const partnerState = await (
    await import("./partner-journey.server")
  ).partnerStateForDeal(String(deal.id));
  const partner =
    partnerState.kind === "partner"
      ? (await import("./partner-journey")).partnerDashboardView(partnerState.progress)
      : null;
  const partnerUnavailable = partnerState.kind === "partner_unavailable";
  // A deal whose chosen type is a partner implementation never gets the standard
  // plan, before Closed Won or after it.
  const { isPartnerDeal, partnerNameFor } = await import("./partner-implementation");
  const partnerDeal = isPartnerDeal(intake);
  const partnerName = partnerDeal ? partnerNameFor(intake) : null;
  const focus = implementationFocusView(intake);
  const focusFallback = implementationFocusFallbackView(
    (await import("./implementation-focus")).proposeImplementationFocus(intake),
  );
  const scope = kickoffFocusContent(focus, focusFallback);
  return {
    dealId: String(deal.id),
    clientName: input.clientName,
    industry: input.industry,
    icon: industryIcon(input.industry),
    timeline: input.timeline,
    lead: leadName,
    fieldTester: input.fieldTester,
    fieldTesterDue: intake.timeline.field_tester_due,
    fieldTesterSource: input.fieldTesterSource ?? null,
    currentProcess: input.currentProcess ?? null,
    currentProcessSource: input.currentProcessSource ?? null,
    team: {
      ...(input.team ?? {
        lead: input.lead,
        accountManager: null,
        solutionsEngineer: null,
        champion: null,
      }),
      lead: leadName,
      leadEmail,
      leadCard: leadCard
        ? {
            // A customer reads this under the lead's name. An internal job
            // title is a fine default only when somebody has written one.
            title: leadCard.title ?? "Onboarding lead",
            // Off unless switched on for this customer.
            bookingUrl: bookingOn ? leadCard.bookingUrl : null,
            photoUrl: leadCard.photoUrl,
            bio: leadCard.bio,
          }
        : null,
    },
    firstForm: input.firstForm,
    formArtifacts,
    firstFormSource: input.firstForm ? (input.firstFormSource ?? "person") : null,
    nextUseCases: input.nextUseCases,
    purchasedSolutions: purchasedSolutionsFor(intake),
    photoUrl,
    toolMarks,
    clientLogoUrl,
    homeworkDone,
    readiness,
    // Internal only: whether the deck was reviewed (the Review step's own
    // key) and where the AI reading stands, for the "check before sharing"
    // banner. The customer's copy carries neither.
    aiReading: opts.internal ? (intake.ai_reading?.status ?? null) : null,
    reviewed: opts.internal ? Boolean(intake.handoff_tasks["reviewed"]) : null,
    shareUrl: opts.internal ? ((deal.welcome_share_url as string | null) ?? null) : null,
    qrDataUrl:
      opts.internal && deal.welcome_share_url
        ? await (
            await import("qrcode")
          ).toDataURL(String(deal.welcome_share_url), {
            margin: 1,
            width: 512,
            color: { dark: "#072b57", light: "#ffffff" },
          })
        : null,
    // "Sent" is the copy of the link, or the customer opening it — not the
    // link merely existing, which happens at assignment.
    sharedAt: opts.internal ? (readIntake(deal.intake).welcome_shared_at ?? null) : null,
    openedAt: opts.internal ? (deal.welcome_opened_at ?? null) : null,
    issuedAt: opts.internal && deal.welcome_share_url ? (deal.welcome_issued_at ?? null) : null,
    hiddenScreens: (await import("./intake-answers")).readIntake(deal.intake)
      .welcome_hidden_screens,
    textOverrides: (await import("./intake-answers")).readIntake(deal.intake).welcome_text,
    path: input.timeline.path,
    // A partner deal is not offered the New Logo help articles.
    helpPicks: partnerDeal
      ? []
      : (await import("./intake-answers")).readIntake(deal.intake).help_picks.map((p) => ({
          article_id: p.article_id,
          title: p.title,
          url: p.url,
          why: p.why,
          when: p.when ?? null,
        })),
    helpOpened: opts.internal
      ? await (await import("./server/help/articles.server")).helpOpensFor(String(deal.id))
      : {},
    goBase:
      !opts.internal && opts.token
        ? `${(await import("./app-url")).appUrl()}/go/${opts.token}`
        : null,
    parkingLot: lot,
    workflowStory: workflowStoryView(readIntake(deal.intake)),
    implementationFocus: focus,
    // Kickoff-only: a presentation-time proposal from existing structured
    // evidence, read fresh on every view and never written back — see
    // implementation-focus.ts's proposeImplementationFocus.
    implementationFocusFallback: focusFallback,
    customerScope: { state: scope.state, items: scope.state === "empty" ? [] : scope.items },
    intake: (await import("./sales-handoff")).customerPrompt(readIntake(deal.intake)),
    // A partner deal runs its own journey: the six-stage one (read from the deal
    // stage) is left off, and the partner dashboard is read from its records instead.
    journey:
      partner || partnerUnavailable || partnerDeal
        ? null
        : (await import("./welcome-journey")).customerJourney({
            stage: deal.stage ?? null,
            intake: readIntake(deal.intake),
            timeline: input.timeline,
            homeworkDone,
            parkingLot: lot,
            leadName,
            stageTransitions,
            railStatuses,
          }),
    partner,
    partnerUnavailable,
    partnerDeal,
    partnerName,
  };
}

/**
 * Each customer stage's status on the Current Implementation rail, read from
 * the same flow the rail reads (flowForDeal → railStatuses). Never throws: a
 * read that fails returns nothing, so no stage is hidden on a guess.
 */
async function railStatusesForDeal(
  dealId: string,
): Promise<import("./welcome-journey").RailStageStatus[]> {
  try {
    const { flowForDeal } = await import("./stage-flow.server");
    const built = await flowForDeal(dealId);
    if (!built) return [];
    const { railStatuses, CANONICAL_JOURNEY_KEYS } = await import("./stage-flow");
    // The rail shows only the canonical journey, so the customer's journey
    // is read over exactly the same stages and current stage.
    const canonical = built.flow.stages.filter((s) => CANONICAL_JOURNEY_KEYS.includes(s.key));
    const current =
      built.flow.current && CANONICAL_JOURNEY_KEYS.includes(built.flow.current)
        ? built.flow.current
        : null;
    return railStatuses(canonical, current);
  } catch (error) {
    console.error("[welcome] could not read the implementation rail", error);
    return [];
  }
}

/**
 * The deal's own stage moves, for each stage's "completed" date on the
 * customer's journey (stageCompletionFromTransitions). Never the internal
 * implementation_stage_history track, which runs a stage behind the deal.
 * Never throws: a read that fails shows no completion dates.
 */
async function stageTransitionsForDeal(
  dealId: string,
): Promise<import("./welcome-journey").DealStageTransition[]> {
  try {
    const { data, error } = await db()
      .from("portal_stage_transitions")
      .select("to_stage,occurred_at")
      .eq("account_id", dealId)
      .order("occurred_at", { ascending: true });
    if (error) throw error;
    return (data ?? []) as import("./welcome-journey").DealStageTransition[];
  } catch (error) {
    console.error("[welcome] could not read the deal's stage history", error);
    return [];
  }
}

/** The parking lot for the customer's page. Never throws: an empty lot is a quiet page. */
async function parkingLotFor(dealId: string): Promise<NonNullable<WelcomeView["parkingLot"]>> {
  try {
    const { listParkingLot } = await import("./parking-lot.server");
    return (await listParkingLot(dealId))
      .filter((i) => i.status !== "dropped")
      .map((i) => ({
        request: i.request,
        target: i.target,
        status: i.status as "open" | "scheduled" | "done",
        neededForLaunch: i.needed_for_launch,
        owner: i.owner,
      }));
  } catch {
    return [];
  }
}

const DEAL_COLUMNS =
  "id,name,display_name,logo_path,stage,se_owner_id,am_owner_id,welcome_token_hash,welcome_issued_at,welcome_opened_at,welcome_homework,welcome_share_url,intake";

export async function loadWelcome(dealId: string): Promise<WelcomeView | null> {
  const { data: deal } = await db()
    .from("portal_accounts")
    .select(DEAL_COLUMNS)
    .eq("id", dealId)
    .maybeSingle();
  if (!deal) return null;
  return viewFor(deal, { internal: true });
}

/**
 * What the customer would see on their link, read for the TIS to preview from
 * Current Implementation. The same customer projection the link itself uses,
 * read without a token: resource links are the direct article addresses, since
 * there is no customer link to track them through. Read-only.
 */
export async function customerPreviewView(dealId: string): Promise<WelcomeView | null> {
  const { data: deal } = await db()
    .from("portal_accounts")
    .select(DEAL_COLUMNS)
    .eq("id", dealId)
    .maybeSingle();
  if (!deal) return null;
  return customerWelcomeView(await viewFor(deal, { internal: false, token: null }));
}

/** Mint (or rotate) the customer's link. Returns the raw URL, once. */
export async function issueWelcomeLink(
  userId: string,
  dealId: string,
): Promise<{ url: string; issuedAt: string }> {
  const { requireSalesEditor } = await import("./presale.server");
  await requireSalesEditor(userId);
  return issueWelcomeLinkAs(userId, dealId);
}

/** The same, for the system — at assignment, so the link exists before anyone asks for it. */
export async function issueWelcomeLinkAs(
  actorId: string | null,
  dealId: string,
): Promise<{ url: string; issuedAt: string }> {
  const { randomBytes } = await import("node:crypto");
  const token = `${TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
  const issuedAt = new Date().toISOString();
  const url = shareUrlFor(token);
  const { error } = await db()
    .from("portal_accounts")
    .update({
      welcome_token_hash: hashToken(token),
      welcome_issued_at: issuedAt,
      welcome_opened_at: null,
      welcome_share_url: url,
    })
    .eq("id", dealId);
  if (error) throw new Error(`Could not issue the link: ${error.message}`);
  await audit({
    actor_type: actorId ? "user" : "system",
    actor_id: actorId,
    action: "welcome.link_issued",
    entity_type: "account",
    entity_id: dealId,
    payload: {},
  });
  return { url, issuedAt };
}

/**
 * Did a person turn the customer link off, with no link issued since? The
 * audit log is the record: the latest of "link_revoked" and "link_issued"
 * for the deal. A read that fails throws: not knowing is never taken as
 * "on", so the system does not bring back a link a person turned off. Its
 * callers (assignment, the deal's reading) report the link as not made.
 */
export async function welcomeLinkTurnedOff(dealId: string): Promise<boolean> {
  const { data, error } = await db()
    .from("portal_audit_log")
    .select("action, created_at")
    .eq("entity_type", "account")
    .eq("entity_id", dealId)
    .in("action", ["welcome.link_revoked", "welcome.link_issued"])
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) {
    console.error("[welcome] could not read the link's history", dealId, error);
    throw new Error("Could not read whether the customer link was turned off.");
  }
  return (data?.[0]?.action as string | undefined) === "welcome.link_revoked";
}

/**
 * The system's own issue (a reading, an assignment): never brings back a
 * link a person turned off. Null then; a person issues a new one from the
 * deck when they want one.
 */
export async function issueWelcomeLinkUnlessOff(
  actorId: string | null,
  dealId: string,
): Promise<{ url: string; issuedAt: string } | null> {
  if (await welcomeLinkTurnedOff(dealId)) return null;
  return issueWelcomeLinkAs(actorId, dealId);
}

export async function revokeWelcomeLink(userId: string, dealId: string): Promise<void> {
  const { requireSalesEditor } = await import("./presale.server");
  await requireSalesEditor(userId);
  const { error } = await db()
    .from("portal_accounts")
    .update({ welcome_token_hash: null, welcome_issued_at: null, welcome_share_url: null })
    .eq("id", dealId);
  if (error) throw new Error(`Could not revoke the link: ${error.message}`);
  await audit({
    actor_type: "user",
    actor_id: userId,
    action: "welcome.link_revoked",
    entity_type: "account",
    entity_id: dealId,
    payload: {},
  });
}

/**
 * The deal a link opens. Null only when the read worked and no deal has the
 * link (unknown, revoked, replaced). A failed read throws: a database blip
 * must never tell the customer their link is gone, and the page's poll keeps
 * what it showed until the next read.
 */
async function dealForToken(token: string): Promise<any | null> {
  if (!token.startsWith(TOKEN_PREFIX) || token.length < 20 || token.length > 120) return null;
  const { data, error } = await db()
    .from("portal_accounts")
    .select(DEAL_COLUMNS)
    .eq("welcome_token_hash", hashToken(token))
    .maybeSingle();
  if (error) throw new Error("Could not read the link. Try again in a moment.");
  return data ?? null;
}

const OPEN_STAMP_EVERY_MS = 15 * 60_000;

/** The customer's door. Null for any bad token — one neutral message, no detail. */
export async function openWelcome(
  token: string,
  budget: "read" | "click" = "read",
): Promise<WelcomeView | null> {
  // The page's own reads, or a calendar download on the click budget.
  limitLink(token, budget);
  const deal = await dealForToken(token);
  if (!deal) return null;
  // "Last opened", not only the first open: re-stamped at most every fifteen
  // minutes, so the page's ten-second poll is not a write every time.
  const last = deal.welcome_opened_at ? Date.parse(String(deal.welcome_opened_at)) : NaN;
  if (!deal.welcome_opened_at || !(Date.now() - last < OPEN_STAMP_EVERY_MS)) {
    await db()
      .from("portal_accounts")
      .update({ welcome_opened_at: new Date().toISOString() })
      .eq("id", deal.id);
  }
  return customerWelcomeView(await viewFor(deal, { internal: false, token }));
}

/**
 * A tracked help link: the token names the deal, the article must be one
 * of its picks, and the open is recorded before the reader is sent on.
 * Null for anything else — never an open redirect.
 */
export async function followHelpLink(token: string, articleId: string): Promise<string | null> {
  // Over the read budget: the same neutral "not found" as a bad link.
  if (!takeRateLimit(`welcome:click:${hashToken(token)}`, WELCOME_CLICK_LIMIT)) return null;
  const deal = await dealForToken(token);
  if (!deal) return null;
  const { readIntake } = await import("./intake-answers");
  const pick = readIntake(deal.intake).help_picks.find((p) => p.article_id === articleId);
  if (!pick) return null;
  const { recordHelpClick } = await import("./server/help/articles.server");
  await recordHelpClick(String(deal.id), articleId);
  return pick.url;
}

/**
 * The customer answers (or confirms) one of the handoff's questions. Only a
 * question that was sent to them, or one they can see on their page; the
 * answer is stamped as theirs. Merged in code: the merge RPC replaces a
 * top-level key whole, and the handoff block is a set of stamps.
 */
export async function answerWelcomeIntake(
  token: string,
  key: string,
  value: import("./sales-handoff").HandoffValue,
): Promise<NonNullable<WelcomeView["intake"]>> {
  limitLink(token, "write");
  const deal = await dealForToken(token);
  if (!deal) throw new Error("This link isn't available");
  const { readIntake } = await import("./intake-answers");
  const { customerPrompt, handoffPatch, handoffQuestion, mergeHandoffBlock } =
    await import("./sales-handoff");
  const current = readIntake(deal.intake);
  const q = handoffQuestion(key);
  const visible =
    q !== null &&
    (current.handoff.asked.includes(key) || (q.share && current.handoff.sent_to_customer_at));
  if (!visible) throw new Error("That question isn't on your page");
  const patch = handoffPatch(key, value, {
    source: "customer",
    by: null,
    at: new Date().toISOString(),
  });
  const { handoff, ...fields } = patch;
  const merged = mergeHandoffBlock(current.handoff, handoff);
  // A field the customer answered is theirs from now on: the AI stops refreshing it.
  const { claimByPerson } = await import("./intake-answers");
  const owned = claimByPerson(current, Object.keys(fields));
  const { mergeIntake } = await import("./server/intake-merge");
  await mergeIntake(String(deal.id), { ...fields, ...owned, handoff: merged });
  await audit({
    actor_type: "system",
    actor_id: null,
    action: "welcome.intake_answered",
    entity_type: "account",
    entity_id: String(deal.id),
    payload: { key },
  });
  // The deal's stage follows: a customer who just answered the last question
  // may have made it Ready for Kickoff.
  try {
    const { syncDealStage } = await import("./stage-flow.server");
    await syncDealStage(String(deal.id), null);
  } catch (e) {
    console.error("[welcome] could not sync the deal's stage", e);
  }
  const { data: after } = await db()
    .from("portal_accounts")
    .select("intake")
    .eq("id", deal.id)
    .maybeSingle();
  // Through the same allow-list as the page's own read of these questions.
  return customerIntakeView(customerPrompt(readIntake(after?.intake)) ?? { known: [], needed: [] });
}

/**
 * The customer says a solution they were asked to test works. The Accept
 * step is stamped as tested today and the ball comes back to us; Accepted
 * itself stays the team's tick, after they have seen it. Only a solution
 * that is actually waiting on the customer's test.
 */
export async function confirmSolutionTested(
  token: string,
  solutionId: string,
): Promise<import("./welcome-journey").CustomerJourney | null> {
  limitLink(token, "write");
  const deal = await dealForToken(token);
  if (!deal) throw new Error("This link isn't available");
  const { readIntake } = await import("./intake-answers");
  const { solutionStatus, isSolutionKind } = await import("./onboarding-services");
  const { localIso, shortDay } = await import("./onboarding-timeline");
  const current = readIntake(deal.intake);
  const s = current.timeline.services.find((x) => x.id === solutionId);
  if (!s || !isSolutionKind(s.kind)) throw new Error("That isn't on your plan");
  if (solutionStatus(s as never, current.timeline.completed) !== "accept") {
    throw new Error("That one isn't ready for your test yet");
  }
  const today = localIso();
  const timeline = {
    ...current.timeline,
    completed: { ...current.timeline.completed, [`${solutionId}:review`]: today },
    services: current.timeline.services.map((x) =>
      x.id === solutionId
        ? {
            ...x,
            ball: {
              who: "us" as const,
              person: null,
              date: null,
              note: `The customer said it works — on their page, ${shortDay(today)}`,
            },
          }
        : x,
    ),
  };
  const { mergeIntake } = await import("./server/intake-merge");
  await mergeIntake(String(deal.id), { timeline });
  await audit({
    actor_type: "system",
    actor_id: null,
    action: "welcome.solution_confirmed",
    entity_type: "account",
    entity_id: String(deal.id),
    payload: { solution_id: solutionId },
  });
  const after = await dealForToken(token);
  // Through the customer projection, like every read of the link: the
  // internal notes and blockers on the other solutions never reach the browser.
  return after
    ? (customerWelcomeView(await viewFor(after, { internal: false, token })).journey ?? null)
    : null;
}

/** The one public write: a homework box, ticked or unticked. */
export async function tickWelcomeHomework(
  token: string,
  key: HomeworkKey,
  done: boolean,
): Promise<Record<string, string>> {
  limitLink(token, "write");
  const deal = await dealForToken(token);
  if (!deal) throw new Error("This link isn't available");
  const current = { ...((deal.welcome_homework ?? {}) as Record<string, string>) };
  if (done) current[key] = new Date().toISOString();
  else delete current[key];
  const { error } = await db()
    .from("portal_accounts")
    .update({ welcome_homework: current })
    .eq("id", deal.id);
  if (error) throw new Error("That didn't save");
  // Only the homework keys the page ticks, as on every read of the link.
  return customerHomeworkView(current);
}
