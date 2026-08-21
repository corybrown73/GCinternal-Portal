"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateApiKey, API_SCOPES } from "@/lib/api-auth";
import { audit } from "@/lib/audit";

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  const { data: profile } = await supabase
    .from("portal_profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") throw new Error("Admins only");
  return user;
}

export async function createApiKeyAction(input: {
  name: string;
  scopes: string[];
}): Promise<{ key: string }> {
  const user = await requireAdmin();
  const name = input.name.trim();
  if (!name) throw new Error("Name the key after its consumer, e.g. 'Zapier — Closed Won'");
  const scopes = input.scopes.filter((s) => (API_SCOPES as readonly string[]).includes(s));
  if (scopes.length === 0) throw new Error("Pick at least one scope");

  const { key, hash, prefix } = generateApiKey();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("portal_api_keys")
    .insert({ name, key_prefix: prefix, key_hash: hash, scopes, created_by: user.id })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  await audit({
    actor_type: "user",
    actor_id: user.id,
    action: "apikey.create",
    entity_type: "api_key",
    entity_id: data.id,
    payload: { name, scopes },
  });
  revalidatePath("/admin/api-keys");
  return { key };
}

export async function revokeApiKeyAction(keyId: string) {
  const user = await requireAdmin();
  const admin = createAdminClient();
  const { error } = await admin
    .from("portal_api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", keyId);
  if (error) throw new Error(error.message);
  await audit({
    actor_type: "user",
    actor_id: user.id,
    action: "apikey.revoke",
    entity_type: "api_key",
    entity_id: keyId,
  });
  revalidatePath("/admin/api-keys");
}
