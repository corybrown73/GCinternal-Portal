import { supabaseAdmin } from "@/integrations/supabase/client.server";

import { audit } from "./server/audit";

const db = () => supabaseAdmin as any;

/**
 * Delete a customer, super admin only.
 *
 * The customer, every implementation on it and everything hanging off those
 * (the cascade covers stages, history, work items, contacts, invites, plans).
 * The deals that made those implementations go too when asked — the usual
 * case, since a dummy customer came from a dummy deal — else they stay on the
 * pipeline with their customer link cleared.
 *
 * Before any of it, the rows that would be hard to reconstruct are copied
 * to portal_deleted_archive as one batch, so "I deleted the wrong one" is a
 * SQL restore and not a loss. The batch id is on the audit row.
 */
export type DeleteCustomerResult = {
  batch: string;
  customer: string;
  implementations: number;
  deals: number;
  archived: number;
};

export async function deleteCustomer(
  actorId: string,
  customerId: string,
  opts: { deleteDeals: boolean },
): Promise<DeleteCustomerResult> {
  const { data: customer } = await db()
    .from("customers")
    .select("*")
    .eq("id", customerId)
    .maybeSingle();
  if (!customer) throw new Error("That customer no longer exists");

  const [{ data: impls }, { data: deals }] = await Promise.all([
    db().from("implementations").select("*").eq("customer_id", customerId),
    db().from("portal_accounts").select("*").eq("customer_id", customerId),
  ]);
  const implIds = (impls ?? []).map((i: any) => String(i.id));
  const dealIds = (deals ?? []).map((d: any) => String(d.id));
  const batch = crypto.randomUUID();

  // The archive: the parents, and the children whose loss would hurt most.
  const rows: Array<{ kind: string; row_id: string | null; row: unknown }> = [
    { kind: "customers", row_id: customerId, row: customer },
    ...(impls ?? []).map((r: any) => ({ kind: "implementations", row_id: r.id, row: r })),
  ];
  const byImpl = [
    "implementation_stage_history",
    "stage_instances",
    "customer_contacts",
    "work_items",
    "completion_records",
    "handoff_packets",
    "journal_entries",
  ];
  const byCustomer = ["customer_contacts", "customer_users", "customer_invites"];
  if (implIds.length) {
    for (const table of byImpl) {
      if (table === "customer_contacts") continue;
      const { data } = await db().from(table).select("*").in("implementation_id", implIds);
      for (const r of data ?? []) rows.push({ kind: table, row_id: r.id ?? null, row: r });
    }
  }
  for (const table of byCustomer) {
    const { data } = await db().from(table).select("*").eq("customer_id", customerId);
    for (const r of data ?? []) rows.push({ kind: table, row_id: r.id ?? null, row: r });
  }
  if (opts.deleteDeals && dealIds.length) {
    for (const d of deals ?? []) rows.push({ kind: "portal_accounts", row_id: d.id, row: d });
    for (const table of [
      "portal_briefs",
      "portal_gong_reports",
      "portal_onboarding_notes",
      "portal_stage_transitions",
    ]) {
      const { data } = await db().from(table).select("*").in("account_id", dealIds);
      for (const r of data ?? []) rows.push({ kind: table, row_id: r.id ?? null, row: r });
    }
  }
  if (rows.length) {
    const { error } = await db()
      .from("portal_deleted_archive")
      .insert(rows.map((r) => ({ ...r, batch, deleted_by: actorId })));
    if (error) throw new Error(`Could not archive before deleting: ${error.message}`);
  }

  // Now the deletion. The customer first: implementations and their children
  // cascade; a linked deal's customer_id is set null by its foreign key.
  {
    const { error } = await db().from("customers").delete().eq("id", customerId);
    if (error) throw new Error(`Could not delete the customer: ${error.message}`);
  }
  if (opts.deleteDeals && dealIds.length) {
    const { error } = await db().from("portal_accounts").delete().in("id", dealIds);
    if (error) throw new Error(`The customer is gone but its deals are not: ${error.message}`);
  }

  await audit({
    actor_type: "user",
    actor_id: actorId,
    action: "customer.deleted",
    entity_type: "customer",
    entity_id: customerId,
    payload: {
      name: customer.name,
      batch,
      implementations: implIds,
      deals: opts.deleteDeals ? dealIds : [],
      deals_unlinked: opts.deleteDeals ? [] : dealIds,
      archived_rows: rows.length,
    },
  });

  return {
    batch,
    customer: String(customer.name),
    implementations: implIds.length,
    deals: opts.deleteDeals ? dealIds.length : 0,
    archived: rows.length,
  };
}
