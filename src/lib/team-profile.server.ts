import { supabaseAdmin } from "@/integrations/supabase/client.server";

import { normalizeBookingUrl, type TeamCard } from "./team-profile";

/**
 * The person behind the plan.
 *
 * SELF-SERVICE FIRST. Every internal login can set their own title, booking
 * link, bio and photo. A manager can set anyone's, because the welcome page
 * goes out with or without them and a blank is a worse outcome than a
 * manager filling it in. The photo lives in the private attachments bucket
 * and is signed when shown — including on the customer's public link, where
 * the server signs it per view.
 */

const db = () => supabaseAdmin as any;
const BUCKET = "attachments";
const LINK_TTL_S = 60 * 60;
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const IMAGE_MAX_BASE64 = 6_000_000;
const COLS = "id,email,full_name,title,booking_url,photo_path,bio,team_member_id";

async function toCard(row: Record<string, any>): Promise<TeamCard> {
  return {
    profileId: String(row["id"]),
    name: (row["full_name"] as string | null) ?? String(row["email"] ?? ""),
    email: (row["email"] as string | null) ?? null,
    title: (row["title"] as string | null) ?? null,
    bookingUrl: (row["booking_url"] as string | null) ?? null,
    bio: (row["bio"] as string | null) ?? null,
    photoUrl: await signedPhoto(row["photo_path"] as string | null),
  };
}

export async function loadTeamCard(profileId: string): Promise<TeamCard | null> {
  const { data } = await db()
    .from("portal_profiles")
    .select(COLS)
    .eq("id", profileId)
    .maybeSingle();
  return data ? toCard(data) : null;
}

/**
 * The card for the person leading a deal's onboarding: the latest
 * assignment's team member, mapped to their login; else the login whose
 * name matches the lead the plan already names; else the SE, else the AM.
 */
export async function leadCardForDeal(
  deal: { id: string; se_owner_id?: string | null; am_owner_id?: string | null },
  leadName: string | null,
): Promise<TeamCard | null> {
  const { data: assigned } = await db()
    .from("portal_assignments")
    .select("team_member_id")
    .eq("deal_id", deal.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (assigned?.team_member_id) {
    const { data: byMember } = await db()
      .from("portal_profiles")
      .select(COLS)
      .eq("team_member_id", assigned.team_member_id)
      .maybeSingle();
    if (byMember) return toCard(byMember);
  }
  if (leadName) {
    const { data: byName } = await db()
      .from("portal_profiles")
      .select(COLS)
      .eq("full_name", leadName)
      .limit(1)
      .maybeSingle();
    if (byName) return toCard(byName);
  }
  for (const id of [deal.se_owner_id, deal.am_owner_id]) {
    if (!id) continue;
    const card = await loadTeamCard(id);
    if (card) return card;
  }
  return null;
}

export async function saveTeamProfile(
  actorId: string,
  args: { profileId: string; title: string | null; bookingUrl: string | null; bio: string | null },
): Promise<TeamCard> {
  await assertMayEdit(actorId, args.profileId);
  const booking_url = normalizeBookingUrl(args.bookingUrl);
  const { data, error } = await db()
    .from("portal_profiles")
    .update({
      title: args.title?.trim() || null,
      booking_url,
      bio: args.bio?.trim() || null,
    })
    .eq("id", args.profileId)
    .select(COLS)
    .single();
  if (error || !data) throw new Error(error?.message ?? "Could not save the profile");
  const { audit } = await import("./server/audit");
  await audit({
    actor_type: "user",
    actor_id: actorId,
    action: "profile.updated",
    entity_type: "profile",
    entity_id: args.profileId,
    payload: { has_booking: Boolean(booking_url), has_title: Boolean(data["title"]) },
  });
  return toCard(data);
}

export async function uploadTeamPhoto(
  actorId: string,
  args: { profileId: string; fileName: string; contentType: string; dataBase64: string },
): Promise<TeamCard> {
  await assertMayEdit(actorId, args.profileId);
  if (!IMAGE_TYPES.has(args.contentType))
    throw new Error("The photo should be a PNG, JPEG or WebP");
  if (args.dataBase64.length > IMAGE_MAX_BASE64) {
    throw new Error("That photo is over 4MB — a headshot should be far smaller");
  }
  const { data: before } = await db()
    .from("portal_profiles")
    .select("photo_path")
    .eq("id", args.profileId)
    .maybeSingle();
  if (!before) throw new Error("No such login");

  const safe = args.fileName.replace(/[^A-Za-z0-9._-]+/g, "-").slice(-80) || "photo.jpg";
  const path = `team/${args.profileId}/${crypto.randomUUID()}-${safe}`;
  const binary = Buffer.from(args.dataBase64, "base64");
  const { error: upErr } = await db()
    .storage.from(BUCKET)
    .upload(path, binary, { contentType: args.contentType, upsert: false });
  if (upErr) throw new Error(`Could not upload the photo: ${upErr.message}`);

  const { data, error } = await db()
    .from("portal_profiles")
    .update({ photo_path: path })
    .eq("id", args.profileId)
    .select(COLS)
    .single();
  if (error || !data) {
    try {
      await db().storage.from(BUCKET).remove([path]);
    } catch {
      /* the row is what matters */
    }
    throw new Error(error?.message ?? "Could not save the photo");
  }
  const previous = (before as any).photo_path as string | null;
  if (previous && previous !== path) {
    try {
      await db().storage.from(BUCKET).remove([previous]);
    } catch {
      /* an orphaned photo costs pennies */
    }
  }
  return toCard(data);
}

export async function removeTeamPhoto(actorId: string, profileId: string): Promise<TeamCard> {
  await assertMayEdit(actorId, profileId);
  const { data: before } = await db()
    .from("portal_profiles")
    .select("photo_path")
    .eq("id", profileId)
    .maybeSingle();
  const { data, error } = await db()
    .from("portal_profiles")
    .update({ photo_path: null })
    .eq("id", profileId)
    .select(COLS)
    .single();
  if (error || !data) throw new Error(error?.message ?? "Could not remove the photo");
  const previous = (before as any)?.photo_path as string | null;
  if (previous) {
    try {
      await db().storage.from(BUCKET).remove([previous]);
    } catch {
      /* fine */
    }
  }
  return toCard(data);
}

async function assertMayEdit(actorId: string, profileId: string): Promise<void> {
  if (actorId === profileId) return;
  const { requireInternal } = await import("./presale.server");
  const actor = await requireInternal(actorId);
  const { canManage } = await import("./auth");
  if (!canManage(actor.role as any)) {
    throw new Error("You can edit your own profile; a manager can edit anyone's");
  }
}

async function signedPhoto(path: string | null): Promise<string | null> {
  if (!path) return null;
  try {
    const { data } = await db().storage.from(BUCKET).createSignedUrl(path, LINK_TTL_S);
    return (data?.signedUrl as string | undefined) ?? null;
  } catch (e) {
    console.error("[team-profile] could not sign a photo url", e);
    return null;
  }
}
