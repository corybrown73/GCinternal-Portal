import { createHash } from "node:crypto";

import { supabaseAdmin } from "@/integrations/supabase/client.server";

import { readIntake, type IntakeAnswers } from "../../intake-answers";
import type { Account, GongReport, OnboardingNote } from "../../presale-types";
import { prepareDocument, unreadableDocument, type PreparedDocument } from "./documents";

/**
 * Everything the AI reads about a deal, loaded once per step: the record,
 * the call notes, the reviewed onboarding notes, the SOW and the contract
 * as the model will see them, and who owns the deal. The hash over the
 * sources is what tells a job that nothing has arrived since the last
 * reading, so no token is spent reading the same material twice.
 */

const BUCKET = "attachments";

const db = () => supabaseAdmin as any;

export type DealSources = {
  account: Account & Record<string, unknown>;
  intake: IntakeAnswers;
  reports: GongReport[];
  /** Reviewed onboarding notes only; a note nobody checked is not a source. */
  notes: OnboardingNote[];
  sow: PreparedDocument | null;
  contract: PreparedDocument | null;
  team: { am: string | null; se: string | null };
  /** The calls and notes as one text, the way the verifier reads them. */
  callsText: string;
  sourceHash: string;
};

export type DealDocuments = Pick<DealSources, "sow" | "contract">;

/** A document on file, as the model reads it, or null when there is none. */
async function documentAt(
  path: string | null | undefined,
  name: string | null | undefined,
  title: string,
): Promise<PreparedDocument | null> {
  if (!path) return null;
  const label = name ?? path.split("/").pop() ?? title;
  try {
    const { data, error } = await db().storage.from(BUCKET).download(path);
    if (error || !data) {
      return unreadableDocument(
        label,
        `${label} could not be downloaded from storage${error?.message ? ` (${error.message})` : ""}. Upload it again.`,
      );
    }
    const bytes = new Uint8Array(await data.arrayBuffer());
    return await prepareDocument(bytes, label, null, { title });
  } catch (e) {
    return unreadableDocument(
      label,
      `${label} could not be opened (${e instanceof Error ? e.message : String(e)}).`,
    );
  }
}

/** The SOW and the contract on file, through `prepareDocument`, bytes from storage. */
export async function loadDealDocuments(
  account: Pick<Account, "intake"> & {
    sow_document_path?: string | null;
    sow_document_name?: string | null;
  },
): Promise<DealDocuments> {
  const intake = readIntake(account.intake);
  const [sow, contract] = await Promise.all([
    documentAt(account.sow_document_path, account.sow_document_name, "Signed Statement of Work"),
    documentAt(intake.contract?.path, intake.contract?.name, "Signed contract"),
  ]);
  return { sow, contract };
}

export async function loadDealSources(dealId: string): Promise<DealSources> {
  const { data: account } = await db()
    .from("portal_accounts")
    .select("*")
    .eq("id", dealId)
    .maybeSingle();
  if (!account) throw new Error("Deal not found");

  const [{ data: reports }, { data: notes }, documents] = await Promise.all([
    db()
      .from("portal_gong_reports")
      .select("*")
      .eq("account_id", dealId)
      .order("created_at", { ascending: false }),
    db()
      .from("portal_onboarding_notes")
      .select("*")
      .eq("account_id", dealId)
      .eq("review_status", "reviewed")
      .order("created_at", { ascending: false }),
    loadDealDocuments(account),
  ]);

  const team = await ownerNames(account);
  const reportRows = (reports ?? []) as GongReport[];
  const noteRows = (notes ?? []) as OnboardingNote[];
  const callsText = [
    ...reportRows.map((r) => `${r.title}\n${r.content_md}`),
    ...noteRows.map((n) => n.body_md),
  ].join("\n\n");

  return {
    account,
    intake: readIntake(account.intake),
    reports: reportRows,
    notes: noteRows,
    sow: documents.sow,
    contract: documents.contract,
    team,
    callsText,
    sourceHash: sourceHashOf({
      sow: documents.sow,
      contract: documents.contract,
      reports: reportRows,
      notes: noteRows,
      summary: (account.summary as string | null) ?? null,
    }),
  };
}

/**
 * One string that changes when any source does: the documents by their
 * bytes, the call notes by id and text (a Salesforce note edited in place
 * has no updated_at to show for it), the reviewed notes by id, and the
 * record's summary. Pure, so the short-circuit rule can be tested without
 * a database.
 */
export function sourceHashOf(input: {
  sow: Pick<PreparedDocument, "sha256"> | null;
  contract: Pick<PreparedDocument, "sha256"> | null;
  reports: Array<{
    id: string;
    content_md?: string | null;
    updated_at?: string | null;
    created_at?: string | null;
  }>;
  notes: Array<{ id: string }>;
  summary: string | null;
}): string {
  const h = createHash("sha256");
  h.update(`sow:${input.sow?.sha256 ?? ""}\n`);
  h.update(`contract:${input.contract?.sha256 ?? ""}\n`);
  for (const r of [...input.reports].sort((a, b) => a.id.localeCompare(b.id))) {
    const text = r.content_md
      ? createHash("sha256").update(r.content_md).digest("hex").slice(0, 16)
      : "";
    h.update(`report:${r.id}@${r.updated_at ?? r.created_at ?? ""}#${text}\n`);
  }
  for (const n of [...input.notes].sort((a, b) => a.id.localeCompare(b.id))) {
    h.update(`note:${n.id}\n`);
  }
  h.update(`summary:${input.summary ?? ""}`);
  return h.digest("hex");
}

/** The two owners' names; a deck or an email that prints a uuid is worse than a blank. */
async function ownerNames(account: {
  am_owner_id?: string | null;
  se_owner_id?: string | null;
}): Promise<{ am: string | null; se: string | null }> {
  const ids = [account.am_owner_id, account.se_owner_id].filter(Boolean) as string[];
  if (!ids.length) return { am: null, se: null };
  const { data } = await db().from("portal_profiles").select("id,full_name,email").in("id", ids);
  const name = (id: string | null | undefined) => {
    const p = (data ?? []).find((r: any) => r.id === id);
    return p ? (p.full_name as string | null) || (p.email as string) : null;
  };
  return { am: name(account.am_owner_id), se: name(account.se_owner_id) };
}
