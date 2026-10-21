import { supabaseAdmin } from "@/integrations/supabase/client.server";

import {
  claimedOwnersByDeal,
  latestAssignments,
  resolveClaimedOwner,
  workloadByOwner,
  type ClaimedOwner,
} from "./claimed-owner";
import { dealStageFor } from "./deal-stage";
import { isTestAccount } from "./test-accounts";

const db = () => supabaseAdmin as any;

/** A deal's claimed owner, with the person's name. */
export type NamedOwner = ClaimedOwner & { name: string | null };

type ImplRow = {
  id: string;
  deal_id: string | null;
  customer_id?: string | null;
  owner_id: string | null;
  current_stage?: string | null;
  superseded_by_implementation_id?: string | null;
};

/**
 * The claimed owner of each deal (src/lib/claimed-owner.ts), named. Every
 * deal when `dealIds` is omitted. Deals nobody owns are absent.
 */
export async function loadClaimedOwners(
  dealIds?: ReadonlyArray<string>,
): Promise<Map<string, NamedOwner>> {
  const ids = dealIds ? Array.from(new Set(dealIds.filter(Boolean))) : null;
  if (ids && ids.length === 0) return new Map();
  let implQuery = db()
    .from("implementations")
    .select("id,deal_id,owner_id,superseded_by_implementation_id,created_at");
  let ledgerQuery = db().from("portal_assignments").select("deal_id,team_member_id,created_at");
  if (ids) {
    implQuery = implQuery.in("deal_id", ids);
    ledgerQuery = ledgerQuery.in("deal_id", ids);
  }
  const [{ data: impls }, { data: ledger }] = await Promise.all([
    implQuery.order("created_at", { ascending: false }),
    ledgerQuery.order("created_at", { ascending: false }),
  ]);
  const owners = claimedOwnersByDeal(impls ?? [], ledger ?? []);
  const memberIds = [...new Set([...owners.values()].map((o) => o.id))];
  const { data: members } = memberIds.length
    ? await db().from("team_members").select("id,name").in("id", memberIds)
    : { data: [] };
  const nameById = new Map(
    ((members ?? []) as Array<{ id: string; name: string }>).map((m) => [String(m.id), m.name]),
  );
  const out = new Map<string, NamedOwner>();
  for (const [dealId, o] of owners) out.set(dealId, { ...o, name: nameById.get(o.id) ?? null });
  return out;
}

/**
 * What each person carries today: the active book (not superseded, not
 * graduated, not a test account) counted by claimed owner. The Assign
 * picker's "N active" and Reports' "Who carries what" both count this.
 */
export async function loadActiveWorkload(): Promise<Map<string, number>> {
  // Every row counted is a project, so its owner_id decides (the ledger only
  // speaks for a deal with no project, which carries no workload).
  const [{ data: impls }, { data: deals }, { data: customers }] = await Promise.all([
    db()
      .from("implementations")
      .select("id,deal_id,customer_id,owner_id,current_stage,superseded_by_implementation_id"),
    db().from("portal_accounts").select("*"),
    db().from("customers").select("*"),
  ]);
  const dealById = new Map(
    ((deals ?? []) as Array<{ id: string; stage: string; is_test?: boolean | null }>).map((d) => [
      String(d.id),
      d,
    ]),
  );
  const customerById = new Map(
    ((customers ?? []) as Array<{ id: string; is_test?: boolean | null }>).map((c) => [
      String(c.id),
      c,
    ]),
  );
  return workloadByOwner(
    ((impls ?? []) as ImplRow[]).map((i) => {
      const deal = i.deal_id ? dealById.get(i.deal_id) : undefined;
      const customer = i.customer_id ? customerById.get(i.customer_id) : undefined;
      const owner = resolveClaimedOwner({ implementation: i });
      return {
        ownerId: owner?.id ?? null,
        stage: dealStageFor({
          deal_stage: deal?.stage ?? null,
          current_stage: i.current_stage ?? null,
        }),
        superseded: Boolean(i.superseded_by_implementation_id),
        is_test: isTestAccount(deal, customer),
      };
    }),
  );
}

export type OwnerReconcileRow = {
  implementationId: string;
  dealId: string;
  teamMemberId: string;
};

/**
 * One-off repair (QA 8.1): a project with no owner whose deal's ledger names
 * somebody gets that person, as startOnboardingAs does when the project is
 * created. Read-only unless `apply` is true; returns the rows it would
 * change (or changed). Run by hand, never on a schedule.
 *
 * An empty owner a person chose is left alone. The resolver reads a
 * project's empty owner as "nobody", so this must not undo it. Skipped:
 * - a project the newest ledger row already names (assignDeal wrote the
 *   owner onto it then, so the empty owner came later, by hand);
 * - a project whose activity feed records an owner change.
 */
export async function reconcileImplementationOwners(
  opts: { apply?: boolean } = {},
): Promise<{ rows: OwnerReconcileRow[]; applied: number }> {
  const [{ data: impls, error }, { data: ledger, error: ledgerError }] = await Promise.all([
    db()
      .from("implementations")
      .select("id,deal_id,owner_id,superseded_by_implementation_id")
      .is("owner_id", null)
      .is("superseded_by_implementation_id", null)
      .not("deal_id", "is", null),
    db()
      .from("portal_assignments")
      .select("deal_id,implementation_id,team_member_id,created_at")
      .order("created_at", { ascending: false }),
  ]);
  if (error) throw new Error(`Could not read the projects: ${error.message}`);
  if (ledgerError) throw new Error(`Could not read the ledger: ${ledgerError.message}`);
  const byDeal = latestAssignments(
    (ledger ?? []) as Array<{
      deal_id: string | null;
      implementation_id: string | null;
      team_member_id: string | null;
    }>,
  );
  const candidates = ((impls ?? []) as ImplRow[]).filter((i) => {
    const led = i.deal_id ? byDeal.get(i.deal_id) : undefined;
    return Boolean(i.deal_id && led?.team_member_id && led.implementation_id !== i.id);
  });
  // An owner change on record means a person set this project's owner.
  const { data: changed, error: feedError } = candidates.length
    ? await db()
        .from("audit_log")
        .select("entity_id")
        .eq("entity_type", "implementation")
        .eq("field_name", "owner_id")
        .in(
          "entity_id",
          candidates.map((i) => String(i.id)),
        )
    : { data: [], error: null };
  if (feedError) throw new Error(`Could not read the activity feed: ${feedError.message}`);
  const setByHand = new Set(
    ((changed ?? []) as Array<{ entity_id: string }>).map((r) => String(r.entity_id)),
  );
  const rows: OwnerReconcileRow[] = [];
  for (const i of candidates) {
    const led = i.deal_id ? byDeal.get(i.deal_id) : undefined;
    if (!i.deal_id || !led?.team_member_id || setByHand.has(String(i.id))) continue;
    rows.push({
      implementationId: String(i.id),
      dealId: String(i.deal_id),
      teamMemberId: String(led.team_member_id),
    });
  }
  let applied = 0;
  if (opts.apply) {
    for (const r of rows) {
      // Only while still empty: a person who set an owner since wins.
      const { error: e } = await db()
        .from("implementations")
        .update({ owner_id: r.teamMemberId })
        .eq("id", r.implementationId)
        .is("owner_id", null);
      if (e) throw new Error(`Could not set the owner on ${r.implementationId}: ${e.message}`);
      applied += 1;
    }
  }
  return { rows, applied };
}
