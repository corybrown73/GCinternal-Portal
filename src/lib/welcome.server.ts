import { supabaseAdmin } from "@/integrations/supabase/client.server";

import { readIntake } from "./intake-answers";
import { appUrl } from "@/lib/app-url";
import { industryIcon } from "@/lib/industry-icons";
import { HOMEWORK_KEYS, type HomeworkKey, type WelcomeView } from "@/lib/welcome";

import { audit } from "./server/audit";
import { hashToken } from "./server/plan-tokens";

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

  const readiness: WelcomeView["readiness"] = [];
  if (opts.internal) {
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
    if (!leadName)
      readiness.push({
        key: "lead",
        label: "Our onboarding lead",
        hint: "Deal → SE or AM owner, or the project's lead once it exists.",
      });
    if (leadName && (!leadCard?.photoUrl || !leadCard?.bookingUrl))
      readiness.push({
        key: "leadcard",
        label: `${leadName}'s photo and booking link`,
        hint: "Settings → My profile. The team screen shows the face; the closing screen shows the link.",
      });
    if (!photoUrl)
      readiness.push({
        key: "photo",
        label: `A photo for ${input.industry ?? "the industry"}`,
        hint: "Admin → Industry photos. The icon composition stands in until then.",
      });
    const calls = input.timeline.milestones.filter(
      (m) => m.key === "kickoff" || m.key === "working",
    );
    if (calls.some((m) => !m.time))
      readiness.push({
        key: "times",
        label: "Times for both calls",
        hint: "Onboarding plan → set a time on the kickoff and the working session, then send the invites.",
      });
  }

  return {
    dealId: String(deal.id),
    clientName: input.clientName,
    industry: input.industry,
    icon: industryIcon(input.industry),
    timeline: input.timeline,
    lead: leadName,
    fieldTester: input.fieldTester,
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
            title: leadCard.title ?? "Onboarding lead, GoCanvas",
            bookingUrl: leadCard.bookingUrl,
            photoUrl: leadCard.photoUrl,
            bio: leadCard.bio,
          }
        : null,
    },
    firstForm: input.firstForm,
    nextUseCases: input.nextUseCases,
    photoUrl,
    toolMarks,
    clientLogoUrl,
    homeworkDone,
    readiness,
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
    hiddenScreens: (await import("./intake-answers")).readIntake(deal.intake)
      .welcome_hidden_screens,
    textOverrides: (await import("./intake-answers")).readIntake(deal.intake).welcome_text,
    path: input.timeline.path,
    helpPicks: (await import("./intake-answers")).readIntake(deal.intake).help_picks.map((p) => ({
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
  };
}

const DEAL_COLUMNS =
  "id,name,logo_path,se_owner_id,am_owner_id,welcome_token_hash,welcome_issued_at,welcome_opened_at,welcome_homework,welcome_share_url,intake";

export async function loadWelcome(dealId: string): Promise<WelcomeView | null> {
  const { data: deal } = await db()
    .from("portal_accounts")
    .select(DEAL_COLUMNS)
    .eq("id", dealId)
    .maybeSingle();
  if (!deal) return null;
  return viewFor(deal, { internal: true });
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

async function dealForToken(token: string): Promise<any | null> {
  if (!token.startsWith(TOKEN_PREFIX) || token.length < 20 || token.length > 120) return null;
  const { data } = await db()
    .from("portal_accounts")
    .select(DEAL_COLUMNS)
    .eq("welcome_token_hash", hashToken(token))
    .maybeSingle();
  return data ?? null;
}

/** The customer's door. Null for any bad token — one neutral message, no detail. */
export async function openWelcome(token: string): Promise<WelcomeView | null> {
  const deal = await dealForToken(token);
  if (!deal) return null;
  if (!deal.welcome_opened_at) {
    await db()
      .from("portal_accounts")
      .update({ welcome_opened_at: new Date().toISOString() })
      .eq("id", deal.id);
  }
  return viewFor(deal, { internal: false, token });
}

/**
 * A tracked help link: the token names the deal, the article must be one
 * of its picks, and the open is recorded before the reader is sent on.
 * Null for anything else — never an open redirect.
 */
export async function followHelpLink(token: string, articleId: string): Promise<string | null> {
  const deal = await dealForToken(token);
  if (!deal) return null;
  const { readIntake } = await import("./intake-answers");
  const pick = readIntake(deal.intake).help_picks.find((p) => p.article_id === articleId);
  if (!pick) return null;
  const { recordHelpClick } = await import("./server/help/articles.server");
  await recordHelpClick(String(deal.id), articleId);
  return pick.url;
}

/** The one public write: a homework box, ticked or unticked. */
export async function tickWelcomeHomework(
  token: string,
  key: HomeworkKey,
  done: boolean,
): Promise<Record<string, string>> {
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
  return current;
}
