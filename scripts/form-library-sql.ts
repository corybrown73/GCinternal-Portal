/**
 * Print the form library seed as SQL, so the same list that lives in the repo
 * is what production holds.
 *
 *   npx tsx scripts/form-library-sql.ts > /tmp/form-library.sql
 *
 * Idempotent on (industry, name): re-running updates descriptions and tags
 * and leaves pictures alone, because a picture somebody uploaded is not the
 * seed's to replace.
 */
import { formLibraryRows } from "@/lib/form-library-seed";

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const arr = (a: string[]) => `array[${a.map(q).join(",")}]::text[]`;

const rows = formLibraryRows();
console.log("-- form library seed:", rows.length, "rows");
console.log(
  "create unique index if not exists form_templates_industry_name_uq on form_templates (lower(industry), lower(name));",
);
console.log("insert into form_templates (name, industry, description, tags) values");
console.log(
  rows
    .map((r) => `  (${q(r.name)}, ${q(r.industry)}, ${q(r.description)}, ${arr(r.tags)})`)
    .join(",\n"),
);
console.log(
  "on conflict (lower(industry), lower(name)) do update set description = excluded.description, tags = excluded.tags, updated_at = now();",
);
