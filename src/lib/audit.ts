import "server-only";
import { createAdminClient } from "./supabase/admin";

export type ActorType = "user" | "api_key" | "email_token" | "system";

export async function audit(entry: {
  actor_type: ActorType;
  actor_id?: string | null;
  action: string;
  entity_type?: string;
  entity_id?: string;
  payload?: Record<string, unknown>;
}) {
  try {
    const admin = createAdminClient();
    await admin.from("portal_audit_log").insert({
      actor_type: entry.actor_type,
      actor_id: entry.actor_id ?? null,
      action: entry.action,
      entity_type: entry.entity_type ?? null,
      entity_id: entry.entity_id ?? null,
      payload: entry.payload ?? null,
    });
  } catch (e) {
    // Auditing must never take down the request path.
    console.error("audit_log write failed", e);
  }
}
