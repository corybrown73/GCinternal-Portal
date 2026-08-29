import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isFlagOn } from "./app-config.server";
import {
  handoffCompleteness,
  type HandoffCompleteness,
  type HandoffItemKey,
} from "./handoff-completeness";

const db = () => supabaseAdmin as any;

/**
 * The handoff gate.
 *
 * The packet is thin by design (see docs/design/handoff-gate.md): it holds only
 * the fields with no existing home plus the accept/return state, and
 * completeness is computed from the LIVE records. Nothing here copies a success
 * measure, a contact, a commitment or a risk into the packet — that would
 * create a second source of truth that silently diverges.
 */

export type HandoffStatus = "draft" | "submitted" | "accepted" | "returned";

export type HandoffPacket = {
  id: string;
  implementation_id: string;
  status: HandoffStatus;
  integration_dependencies: string | null;
  data_migration_needs: string | null;
  roadmap_promises: string | null;
  discovery_call_links: Array<{ label?: string; url?: string }>;
  submitted_at: string | null;
  decided_at: string | null;
  return_missing_keys: string[];
  return_note: string | null;
};

export type HandoffEvent = {
  id: string;
  kind: "submitted" | "accepted" | "returned" | "reopened";
  actor_name: string | null;
  missing_keys: string[];
  note: string | null;
  created_at: string;
};

export type HandoffView = {
  /** False when the handoff_gate flag is off — the UI explains rather than errors. */
  enabled: boolean;
  packet: HandoffPacket | null;
  completeness: HandoffCompleteness | null;
  events: HandoffEvent[];
};

function toPacket(row: any): HandoffPacket {
  return {
    id: row.id,
    implementation_id: row.implementation_id,
    status: row.status,
    integration_dependencies: row.integration_dependencies,
    data_migration_needs: row.data_migration_needs,
    roadmap_promises: row.roadmap_promises,
    discovery_call_links: Array.isArray(row.discovery_call_links) ? row.discovery_call_links : [],
    submitted_at: row.submitted_at,
    decided_at: row.decided_at,
    return_missing_keys: row.return_missing_keys ?? [],
    return_note: row.return_note,
  };
}

/** Gather the live records completeness reads. Read-only. */
async function gatherInputs(implementationId: string, packetRow: any) {
  const { data: impl } = await db()
    .from("implementations")
    .select("id, customer_id, customer_goals, sow_document_url, sow_reference, discovery_board_url")
    .eq("id", implementationId)
    .maybeSingle();
  if (!impl) return null;

  const [{ data: criteria }, { data: contacts }, { data: commitments }, { data: risks }] =
    await Promise.all([
      db()
        .from("success_criteria")
        .select("description, metric")
        .eq("implementation_id", implementationId),
      db()
        .from("customer_contacts")
        .select("name, role, email")
        .eq("customer_id", impl.customer_id),
      db().from("commitments").select("id").eq("implementation_id", implementationId),
      db().from("risks").select("id").eq("implementation_id", implementationId),
    ]);

  // Discovery calls live on the presale deal, which links to this customer.
  const { data: deals } = await db()
    .from("portal_accounts")
    .select("id")
    .eq("customer_id", impl.customer_id);
  const dealIds = (deals ?? []).map((d: any) => d.id);
  const { data: gong } = dealIds.length
    ? await db().from("portal_gong_reports").select("id").in("account_id", dealIds)
    : { data: [] };

  return {
    implementation: impl,
    packet: packetRow ?? {},
    successCriteria: criteria ?? [],
    contacts: contacts ?? [],
    commitments: commitments ?? [],
    risks: risks ?? [],
    gongReports: gong ?? [],
  };
}

export async function loadHandoff(implementationId: string): Promise<HandoffView> {
  if (!(await isFlagOn("handoff_gate"))) {
    return { enabled: false, packet: null, completeness: null, events: [] };
  }

  const { data: row } = await db()
    .from("handoff_packets")
    .select("*")
    .eq("implementation_id", implementationId)
    .maybeSingle();

  const inputs = await gatherInputs(implementationId, row);
  if (!inputs) return { enabled: true, packet: null, completeness: null, events: [] };

  const completeness = handoffCompleteness(inputs as any);

  let events: HandoffEvent[] = [];
  if (row) {
    const { data: rawEvents } = await db()
      .from("handoff_events")
      .select("id, kind, actor_id, missing_keys, note, created_at")
      .eq("packet_id", row.id)
      .order("created_at", { ascending: false });
    const actorIds = [...new Set((rawEvents ?? []).map((e: any) => e.actor_id).filter(Boolean))];
    const { data: profiles } = actorIds.length
      ? await db().from("portal_profiles").select("id, full_name, email").in("id", actorIds)
      : { data: [] };
    const nameById = new Map<string, string>(
      (profiles ?? []).map((p: any) => [p.id, p.full_name || p.email]),
    );
    events = (rawEvents ?? []).map((e: any) => ({
      id: e.id,
      kind: e.kind,
      actor_name: e.actor_id ? (nameById.get(e.actor_id) ?? null) : null,
      missing_keys: e.missing_keys ?? [],
      note: e.note,
      created_at: e.created_at,
    }));
  }

  return {
    enabled: true,
    packet: row ? toPacket(row) : null,
    completeness,
    events,
  };
}

async function requireEnabled(): Promise<void> {
  if (!(await isFlagOn("handoff_gate"))) {
    throw new Error("The handoff gate is not switched on for this environment.");
  }
}

/** Create the packet on first edit. One per implementation. */
async function ensurePacket(implementationId: string): Promise<any> {
  const { data: existing } = await db()
    .from("handoff_packets")
    .select("*")
    .eq("implementation_id", implementationId)
    .maybeSingle();
  if (existing) return existing;

  const { data, error } = await db()
    .from("handoff_packets")
    .insert({ implementation_id: implementationId })
    .select("*")
    .maybeSingle();
  if (error) throw new Error(`Could not start the handoff packet: ${error.message}`);
  return data;
}

export async function savePacketFields(
  implementationId: string,
  patch: {
    integration_dependencies?: string | null | undefined;
    data_migration_needs?: string | null | undefined;
    roadmap_promises?: string | null | undefined;
    discovery_call_links?: Array<{ label?: string; url?: string }> | undefined;
  },
): Promise<HandoffPacket> {
  await requireEnabled();
  const packet = await ensurePacket(implementationId);
  const { data, error } = await db()
    .from("handoff_packets")
    .update(patch)
    .eq("id", packet.id)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(`Could not save the handoff packet: ${error.message}`);
  return toPacket(data);
}

async function currentCompleteness(implementationId: string, packetRow: any) {
  const inputs = await gatherInputs(implementationId, packetRow);
  if (!inputs) throw new Error("Implementation not found.");
  return handoffCompleteness(inputs as any);
}

/** Sales hands it over. Allowed while incomplete — the gaps are recorded, not hidden. */
export async function submitHandoff(
  implementationId: string,
  actorProfileId: string,
): Promise<HandoffPacket> {
  await requireEnabled();
  const packet = await ensurePacket(implementationId);
  if (packet.status === "accepted") {
    throw new Error("This handoff has already been accepted.");
  }
  const completeness = await currentCompleteness(implementationId, packet);
  const at = new Date().toISOString();

  const { data, error } = await db()
    .from("handoff_packets")
    .update({
      status: "submitted",
      submitted_by: actorProfileId,
      submitted_at: at,
      // A resubmission clears the previous return, which now lives in the events.
      return_missing_keys: [],
      return_note: null,
    })
    .eq("id", packet.id)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(`Could not submit the handoff: ${error.message}`);

  await db().from("handoff_events").insert({
    packet_id: packet.id,
    implementation_id: implementationId,
    kind: "submitted",
    actor_id: actorProfileId,
    missing_keys: completeness.missingKeys,
    snapshot: completeness,
  });

  return toPacket(data);
}

/**
 * Delivery accepts. Deliberately allowed while incomplete: the implementation
 * owner is the one accountable, and blocking them protects nobody while
 * teaching everyone to fill required fields with noise. What was missing at the
 * moment of acceptance is recorded — which is the stronger accountability.
 */
export async function acceptHandoff(
  implementationId: string,
  actorProfileId: string,
  note: string | null,
): Promise<HandoffPacket> {
  await requireEnabled();
  const packet = await ensurePacket(implementationId);
  const completeness = await currentCompleteness(implementationId, packet);
  const at = new Date().toISOString();

  const { data, error } = await db()
    .from("handoff_packets")
    .update({
      status: "accepted",
      decided_by: actorProfileId,
      decided_at: at,
      decision_snapshot: completeness,
    })
    .eq("id", packet.id)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(`Could not accept the handoff: ${error.message}`);

  await db().from("handoff_events").insert({
    packet_id: packet.id,
    implementation_id: implementationId,
    kind: "accepted",
    actor_id: actorProfileId,
    missing_keys: completeness.missingKeys,
    note,
    snapshot: completeness,
  });

  return toPacket(data);
}

/**
 * Delivery returns it with named gaps.
 *
 * The implementation clock is NOT touched: time-in-Handoff keeps accruing
 * through a return, which is the point — a returned handoff is not a paused
 * one. That requires no code here, only the absence of a special case.
 */
export async function returnHandoff(
  implementationId: string,
  actorProfileId: string,
  missingKeys: HandoffItemKey[],
  note: string | null,
): Promise<HandoffPacket> {
  await requireEnabled();
  const packet = await ensurePacket(implementationId);
  const completeness = await currentCompleteness(implementationId, packet);
  const at = new Date().toISOString();

  const { data, error } = await db()
    .from("handoff_packets")
    .update({
      status: "returned",
      decided_by: actorProfileId,
      decided_at: at,
      return_missing_keys: missingKeys,
      return_note: note,
      decision_snapshot: completeness,
    })
    .eq("id", packet.id)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(`Could not return the handoff: ${error.message}`);

  await db().from("handoff_events").insert({
    packet_id: packet.id,
    implementation_id: implementationId,
    kind: "returned",
    actor_id: actorProfileId,
    missing_keys: missingKeys,
    note,
    snapshot: completeness,
  });

  // Raise it where the team already looks, and tell the sales owner.
  try {
    const { createAlert } = await import("./tickets.server");
    const { data: impl } = await db()
      .from("implementations")
      .select("id, name, customer_id, sales_owner")
      .eq("id", implementationId)
      .maybeSingle();
    await createAlert({
      kind: "handoff_returned",
      severity: "warning",
      title: `Handoff returned: ${impl?.name ?? "implementation"}`,
      detail:
        `The implementation owner returned this handoff with ${missingKeys.length} named gap(s)` +
        `${note ? `: ${note}` : "."} Time in Handoff keeps running.`,
      customerId: impl?.customer_id ?? null,
      implementationId,
      payload: { missing_keys: missingKeys },
      notify: true,
      actor: { type: "user", id: actorProfileId },
    });
  } catch (e) {
    // The return is recorded; failing to announce it must not undo it.
    console.error("[handoff] could not raise the returned alert", e);
  }

  return toPacket(data);
}
