import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * One SOW per deal, wherever it was uploaded.
 *
 * The deal page, the intake, New account, the customer page's "Attach SOW"
 * and Files & links (kind SOW) all store into the same private attachments
 * bucket. Every one of them now points the deal at what was uploaded: the
 * newest upload is the deal's SOW (portal_accounts.sow_document_path/name),
 * and the deal's live project carries the same path, so every "is the SOW
 * in" check reads one answer. The file it replaced is never lost: once the
 * deal has a project it stays under Files & links; before that it is kept in
 * the bucket and listed on the deal (intake.earlier_sows), and filed under
 * Files & links when the project starts (fileEarlierSows).
 * Each adoption queues an AI reading, as a deal-page upload does.
 */

const db = () => supabaseAdmin as any;
const BUCKET = "attachments";

export type PointedSow = {
  previousPath: string | null;
  previousName: string | null;
  /** Files the live project's own SOW columns held before this one (see pointDealAtSow). */
  projectPrevious: Array<{ path: string; name: string | null }>;
};

/**
 * A link to a file kept elsewhere (Docusign, Drive), not a path in our
 * bucket: a scheme, a `www.` start or a dotted host before the first slash
 * (the same test the SOW reading uses).
 */
const isLink = (v: string) => {
  const t = v.trim();
  return (
    /^[a-z][a-z0-9+.-]*:/i.test(t) ||
    /^www\./i.test(t) ||
    /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/|$)/i.test(t)
  );
};

/**
 * Make `path` the deal's SOW and its live project's: newest wins. Also
 * answers "Is there a SOW?" with yes when nobody has answered it. Null when
 * the deal does not exist. Throws only when the deal row cannot be written.
 */
export async function pointDealAtSow(
  dealId: string,
  path: string,
  name: string,
): Promise<PointedSow | null> {
  const { data: before } = await db()
    .from("portal_accounts")
    .select("sow_document_path, sow_document_name, intake")
    .eq("id", dealId)
    .maybeSingle();
  if (!before) return null;
  // Read off before the write: what this upload replaces.
  const previousPath = (before.sow_document_path as string | null) ?? null;
  const previousName = (before.sow_document_name as string | null) ?? null;
  const hasSowAnswer = (before.intake as { has_sow?: boolean | null } | null)?.has_sow ?? null;

  const { error } = await db()
    .from("portal_accounts")
    .update({
      sow_document_path: path,
      sow_document_name: name,
      updated_at: new Date().toISOString(),
    })
    .eq("id", dealId);
  if (error) throw new Error(error.message);

  // The live project's copy of the deal's SOW (carried once at the start,
  // kept in step from here). Never fatal: the deal is the record. The
  // customer page's "Attach SOW" kept its file's path in sow_document_url,
  // which the project reads (and opens) before sow_document_path; a stored
  // path there moves to the new file too, so the project never shows the new
  // name over the old file. The file it held is handed back to be kept. A
  // link to a file kept elsewhere (Docusign, Drive) is filed under Files &
  // links first, then moves too; when it cannot be filed it stays put.
  const projectPrevious: PointedSow["projectPrevious"] = [];
  const { data: live } = await db()
    .from("implementations")
    .select("id, sow_document_url, sow_document_name")
    .eq("deal_id", dealId)
    .is("superseded_by_implementation_id", null);
  for (const row of (live ?? []) as Array<{
    id: string;
    sow_document_url: string | null;
    sow_document_name: string | null;
  }>) {
    const url = row.sow_document_url?.trim() || null;
    const storedUrl = url !== null && !isLink(url);
    if (storedUrl && url !== path && url !== previousPath) {
      projectPrevious.push({ path: url, name: row.sow_document_name ?? null });
    }
    const moves = storedUrl || (url !== null && (await keepLinkedSow(row.id, url, row)));
    // The name goes with the file the project opens.
    const { error: implErr } = await db()
      .from("implementations")
      .update({
        sow_document_path: path,
        ...(moves || url === null ? { sow_document_name: name } : {}),
        ...(moves ? { sow_document_url: path } : {}),
      })
      .eq("id", row.id);
    if (implErr)
      console.error("[deal-sow] could not point the project at the SOW", dealId, implErr);
  }

  // An upload answers the intake's "Is there a SOW?" when nobody has.
  if (hasSowAnswer === null) {
    try {
      const { mergeIntake } = await import("./intake-merge");
      await mergeIntake(dealId, { has_sow: true });
    } catch (e) {
      console.error("[deal-sow] could not record has_sow", dealId, e);
    }
  }

  return { previousPath, previousName, projectPrevious };
}

/**
 * A project's SOW held as a link to a file kept elsewhere, filed under Files
 * & links before a newer SOW takes its place (once: an existing row with the
 * same link is enough). True when it is listed there. Never throws.
 */
async function keepLinkedSow(
  implementationId: string,
  url: string,
  row: { sow_document_name: string | null },
): Promise<boolean> {
  try {
    const { data: have, error: readErr } = await db()
      .from("account_files")
      .select("id")
      .eq("implementation_id", implementationId)
      .eq("external_url", url)
      .limit(1);
    if (readErr) throw new Error(readErr.message);
    if ((have ?? []).length > 0) return true;
    const { error } = await db()
      .from("account_files")
      .insert({
        implementation_id: implementationId,
        title: row.sow_document_name?.trim() || "Earlier SOW",
        kind: "sow",
        external_url: url,
        description: "An earlier SOW, replaced as the deal's SOW by a newer upload.",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return true;
  } catch (e) {
    console.error("[deal-sow] could not keep the project's linked SOW", implementationId, e);
    return false;
  }
}

/**
 * Does anything still point at this stored object: a deal's SOW, a project's
 * SOW columns, or a Files & links row? Removing a Files & links row asks
 * this before deleting the object, since that file may be the deal's SOW.
 */
export async function sowObjectReferenced(path: string): Promise<boolean> {
  const [files, byUrl, byPath, byDeal] = await Promise.all([
    db().from("account_files").select("id").eq("storage_path", path).limit(1),
    db().from("implementations").select("id").eq("sow_document_url", path).limit(1),
    db().from("implementations").select("id").eq("sow_document_path", path).limit(1),
    db().from("portal_accounts").select("id").eq("sow_document_path", path).limit(1),
  ]);
  return [files, byUrl, byPath, byDeal].some((r: any) => (r?.data ?? []).length > 0);
}

export type EarlierSow = { path: string; name: string | null; replaced_at: string };

/**
 * What happens to the SOW a newer upload replaced. Kept under Files & links
 * when the deal has a live project. Before that it stays in the bucket and
 * is listed on the deal's intake (earlier_sows) until the project starts.
 * Never deleted. Never throws.
 */
export async function retireReplacedSow(args: {
  dealId: string;
  previousPath: string | null;
  previousName: string | null;
  newPath: string;
  actorProfileId: string | null;
}): Promise<"none" | "kept" | "parked" | "referenced"> {
  const { previousPath } = args;
  if (!previousPath || previousPath === args.newPath) return "none";
  try {
    if (await sowObjectReferenced(previousPath)) return "referenced";
    const { data: impl } = await db()
      .from("implementations")
      .select("id")
      .eq("deal_id", args.dealId)
      .is("superseded_by_implementation_id", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (impl?.id) {
      const { error } = await db()
        .from("account_files")
        .insert({
          implementation_id: impl.id,
          title: args.previousName || "Earlier SOW",
          kind: "sow",
          storage_path: previousPath,
          description: "An earlier SOW, replaced as the deal's SOW by a newer upload.",
          added_by: args.actorProfileId,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      return "kept";
    }
    // No project yet: keep the object and list it on the deal, so it is
    // filed under Files & links when the project starts.
    const { data: deal } = await db()
      .from("portal_accounts")
      .select("intake")
      .eq("id", args.dealId)
      .maybeSingle();
    const earlier = earlierSowsOf(deal?.intake);
    if (!earlier.some((e) => e.path === previousPath)) {
      const { mergeIntake } = await import("./intake-merge");
      await mergeIntake(args.dealId, {
        earlier_sows: [
          ...earlier,
          {
            path: previousPath,
            name: args.previousName,
            replaced_at: new Date().toISOString(),
          },
        ],
      });
    }
    return "parked";
  } catch (e) {
    console.error("[deal-sow] could not settle the replaced SOW", args.dealId, e);
    return "none";
  }
}

function earlierSowsOf(intake: unknown): EarlierSow[] {
  const list = (intake as { earlier_sows?: unknown } | null)?.earlier_sows;
  if (!Array.isArray(list)) return [];
  return list.filter(
    (e): e is EarlierSow =>
      !!e && typeof (e as EarlierSow).path === "string" && (e as EarlierSow).path !== "",
  );
}

/**
 * The project has started: file the deal's earlier SOWs (replaced before
 * there was a project) under its Files & links. Skips the deal's current SOW
 * and anything the project already lists. Never throws.
 */
export async function fileEarlierSows(args: {
  dealId: string;
  implementationId: string;
  actorProfileId: string | null;
}): Promise<number> {
  try {
    const { data: deal } = await db()
      .from("portal_accounts")
      .select("intake, sow_document_path")
      .eq("id", args.dealId)
      .maybeSingle();
    const earlier = earlierSowsOf(deal?.intake).filter(
      (e) => e.path !== (deal?.sow_document_path ?? null),
    );
    let filed = 0;
    for (const e of earlier) {
      const { data: have } = await db()
        .from("account_files")
        .select("id")
        .eq("implementation_id", args.implementationId)
        .eq("storage_path", e.path)
        .limit(1);
      if ((have ?? []).length > 0) continue;
      const { error } = await db()
        .from("account_files")
        .insert({
          implementation_id: args.implementationId,
          title: e.name || "Earlier SOW",
          kind: "sow",
          storage_path: e.path,
          description: "An earlier SOW, replaced as the deal's SOW by a newer upload.",
          added_by: args.actorProfileId,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      filed += 1;
    }
    return filed;
  } catch (e) {
    console.error("[deal-sow] could not file the deal's earlier SOWs", args.dealId, e);
    return 0;
  }
}

/** Keep every file a newer SOW replaced: the deal's own and its project's. */
export async function retireAllReplaced(args: {
  dealId: string;
  pointed: PointedSow;
  newPath: string;
  actorProfileId: string | null;
}): Promise<void> {
  await retireReplacedSow({
    dealId: args.dealId,
    previousPath: args.pointed.previousPath,
    previousName: args.pointed.previousName,
    newPath: args.newPath,
    actorProfileId: args.actorProfileId,
  });
  for (const p of args.pointed.projectPrevious) {
    await retireReplacedSow({
      dealId: args.dealId,
      previousPath: p.path,
      previousName: p.name,
      newPath: args.newPath,
      actorProfileId: args.actorProfileId,
    });
  }
}

const SOW_DOCUMENT_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

export type AdoptResult =
  { adopted: true; dealId: string } | { adopted: false; reason: "no_deal" | "not_a_document" };

/**
 * A SOW uploaded on the customer page ("Attach SOW", or Files & links with
 * kind SOW) becomes its deal's SOW, and the reading is queued, the same way
 * a deal-page upload does. Only a PDF or a Word file is adopted — what the
 * deal page itself accepts as a signed SOW, and what the reading can read —
 * so a screenshot filed under the default kind never replaces the SOW.
 * `bytes` when the caller has them; otherwise the stored object is read.
 */
export async function adoptUploadedSow(args: {
  implementationId: string;
  path: string;
  name: string;
  actorProfileId: string | null;
  source: "customer_sow_panel" | "files_and_links";
  bytes?: Uint8Array;
}): Promise<AdoptResult> {
  const { data: impl } = await db()
    .from("implementations")
    .select("id, deal_id")
    .eq("id", args.implementationId)
    .maybeSingle();
  const dealId = (impl?.deal_id as string | null | undefined) ?? null;
  if (!dealId) return { adopted: false, reason: "no_deal" };

  let bytes = args.bytes ?? null;
  if (!bytes) {
    const { data: blob } = await db().storage.from(BUCKET).download(args.path);
    bytes = blob ? new Uint8Array(await (blob as Blob).arrayBuffer()) : null;
  }
  const { sniffDocumentType } = await import("./ai/documents");
  const type = bytes ? sniffDocumentType(bytes) : null;
  if (!type || !SOW_DOCUMENT_TYPES.has(type)) return { adopted: false, reason: "not_a_document" };

  const pointed = await pointDealAtSow(dealId, args.path, args.name);
  if (!pointed) return { adopted: false, reason: "no_deal" };
  await retireAllReplaced({
    dealId,
    pointed,
    newPath: args.path,
    actorProfileId: args.actorProfileId,
  });

  const { audit } = await import("./audit");
  await audit({
    actor_type: "user",
    actor_id: args.actorProfileId,
    action: "account.sow_uploaded",
    entity_type: "account",
    entity_id: dealId,
    payload: {
      file_name: args.name,
      replaced: pointed.previousPath,
      from: args.source,
      implementation_id: args.implementationId,
    },
  });

  // The document is the reading's reason to exist: queued, never waited on.
  const { autoReadDeal } = await import("./ai/jobs");
  await autoReadDeal(dealId, "sow_upload", args.actorProfileId);

  return { adopted: true, dealId };
}
