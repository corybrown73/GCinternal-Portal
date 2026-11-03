// Prints ONE read-only query that says, per migration, whether the database
// it is run against has what that migration creates.
//
//   node scripts/schema-verify.mjs                 every verify file
//   node scripts/schema-verify.mjs --since 0087    migrations 0087 and later
//   node scripts/schema-verify.mjs --failing       only the rows that are false
//
// Run the output in the PRODUCTION SQL editor (or `psql "$READONLY_URL" -f -`)
// before merging code that depends on a migration. Every row must be ok = true.
// CI runs the same query on a freshly migrated database, which proves each
// verify file is correct; it says nothing about production.
import { readdirSync, readFileSync } from "node:fs";

import { combinedVerifySql } from "./lib/migration-rules.mjs";

const args = process.argv.slice(2);
const sinceIdx = args.indexOf("--since");
const since = sinceIdx >= 0 ? Number(args[sinceIdx + 1]) : 0;
const failingOnly = args.includes("--failing");

const files = readdirSync("supabase/verify")
  .filter((f) => /^\d{4}_verify\.sql$/.test(f) && Number(f.slice(0, 4)) >= since)
  .sort()
  .map((name) => ({ name, text: readFileSync(`supabase/verify/${name}`, "utf8") }));

try {
  process.stdout.write(`${combinedVerifySql(files, { failingOnly })}\n`);
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
}
