import { supabaseAdmin } from "@/integrations/supabase/client.server";

import { audit } from "./server/audit";

const db = () => supabaseAdmin as any;

export type ParkingItem = {
  id: string;
  request: string;
  why: string;
  needed_for_launch: boolean;
  owner: "gocanvas" | "customer" | "both";
  target: string;
  status: "open" | "scheduled" | "done" | "dropped";
  created_at: string;
};

const COLS = "id,request,why,needed_for_launch,owner,target,status,created_at";

/** The deal's parking lot, oldest first: the order it came up in. */
export async function listParkingLot(dealId: string): Promise<ParkingItem[]> {
  const { data, error } = await db()
    .from("portal_parking_lot")
    .select(COLS)
    .eq("account_id", dealId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Could not read the parking lot: ${error.message}`);
  return (data ?? []) as ParkingItem[];
}

export async function addParkingItem(
  userId: string,
  dealId: string,
  item: Pick<ParkingItem, "request" | "why" | "needed_for_launch" | "owner" | "target">,
): Promise<ParkingItem> {
  const { data, error } = await db()
    .from("portal_parking_lot")
    .insert({ account_id: dealId, created_by: userId, ...item })
    .select(COLS)
    .single();
  if (error || !data) throw new Error(`Could not park that: ${error?.message ?? "no row"}`);
  await audit({
    actor_type: "user",
    actor_id: userId,
    action: "parking_lot.added",
    entity_type: "account",
    entity_id: dealId,
    payload: { request: item.request, needed_for_launch: item.needed_for_launch },
  });
  return data as ParkingItem;
}

export async function updateParkingItem(
  userId: string,
  id: string,
  patch: {
    [K in "request" | "why" | "needed_for_launch" | "owner" | "target" | "status"]?:
      ParkingItem[K] | undefined;
  },
): Promise<ParkingItem> {
  const { data, error } = await db()
    .from("portal_parking_lot")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select(`${COLS},account_id`)
    .single();
  if (error || !data) throw new Error(`Could not update that: ${error?.message ?? "no row"}`);
  await audit({
    actor_type: "user",
    actor_id: userId,
    action: "parking_lot.updated",
    entity_type: "account",
    entity_id: String((data as { account_id: string }).account_id),
    payload: { id, ...patch },
  });
  return data as ParkingItem;
}

export async function removeParkingItem(userId: string, id: string): Promise<void> {
  const { data } = await db()
    .from("portal_parking_lot")
    .delete()
    .eq("id", id)
    .select("account_id,request")
    .maybeSingle();
  if (data) {
    await audit({
      actor_type: "user",
      actor_id: userId,
      action: "parking_lot.removed",
      entity_type: "account",
      entity_id: String(data.account_id),
      payload: { request: data.request },
    });
  }
}
