import Papa from "papaparse";
import { createClient } from "@/lib/supabase/server";
import { upsertAccount } from "@/lib/accounts";
import { accountUpsertSchema } from "@/lib/schemas";
import { isStage } from "@/lib/stages";

export const runtime = "nodejs";

// Header names are matched case-insensitively with spaces/underscores ignored.
const COLUMN_ALIASES: Record<string, string> = {
  name: "name",
  account: "name",
  accountname: "name",
  salesforceid: "salesforce_id",
  sfid: "salesforce_id",
  domain: "domain",
  website: "domain",
  stage: "stage",
  arr: "arr",
  amowneremail: "am_owner_email",
  owneremail: "am_owner_email",
  summary: "summary",
};

function normalizeHeader(h: string): string | null {
  return COLUMN_ALIASES[h.toLowerCase().replace(/[\s_-]/g, "")] ?? null;
}

function normalizeStage(raw: string): string {
  return raw.toLowerCase().trim().replace(/[\s-]+/g, "_");
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: { code: "unauthorized", message: "Sign in first" } }, { status: 401 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: { code: "no_file", message: "Attach a CSV file" } }, { status: 422 });
  }
  if (file.size > 2 * 1024 * 1024) {
    return Response.json({ error: { code: "too_large", message: "CSV must be under 2 MB" } }, { status: 422 });
  }

  const text = await file.text();
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  });

  let created = 0;
  let updated = 0;
  let stageChanges = 0;
  const errors: { row: number; message: string }[] = [];

  for (let i = 0; i < parsed.data.length; i++) {
    const raw = parsed.data[i];
    const mapped: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(raw)) {
      const col = normalizeHeader(key);
      if (!col || value == null || String(value).trim() === "") continue;
      mapped[col] = String(value).trim();
    }
    if (mapped.arr !== undefined) {
      const n = Number(String(mapped.arr).replace(/[$,]/g, ""));
      if (Number.isNaN(n)) delete mapped.arr;
      else mapped.arr = n;
    }
    if (mapped.stage !== undefined) {
      const s = normalizeStage(String(mapped.stage));
      if (isStage(s)) mapped.stage = s;
      else {
        errors.push({ row: i + 2, message: `Unknown stage "${mapped.stage}"` });
        continue;
      }
    }

    const check = accountUpsertSchema.safeParse(mapped);
    if (!check.success) {
      errors.push({
        row: i + 2,
        message: check.error.issues.map((iss) => `${iss.path.join(".")}: ${iss.message}`).join("; "),
      });
      continue;
    }

    try {
      const result = await upsertAccount(check.data, {
        source: "csv_import",
        actorProfileId: user.id,
      });
      if (result.created) created++;
      else updated++;
      if (result.stage_changed) stageChanges++;
    } catch (e) {
      errors.push({ row: i + 2, message: e instanceof Error ? e.message : "Unknown error" });
    }
  }

  return Response.json({ created, updated, stage_changes: stageChanges, errors });
}
