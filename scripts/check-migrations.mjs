// Checks the migration set: unique versions, a new migration numbered after
// everything on the base branch, and a down script and verify file for every
// migration from VERIFY_REQUIRED_FROM on (scripts/lib/migration-rules.mjs).
//
//   node scripts/check-migrations.mjs                     the branch on its own
//   node scripts/check-migrations.mjs --base origin/main  also against the base
//
// It reads files and git only. It never connects to a database.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";

import { checkMigrations } from "./lib/migration-rules.mjs";

const args = process.argv.slice(2);
const baseIdx = args.indexOf("--base");
const base = baseIdx >= 0 ? args[baseIdx + 1] : null;

const list = (dir) => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".sql")) : []);

let baseMigrations = null;
if (base) {
  const out = execFileSync("git", ["ls-tree", "-r", "--name-only", base, "supabase/migrations"], {
    encoding: "utf8",
  });
  baseMigrations = out
    .split("\n")
    .filter((p) => p.endsWith(".sql"))
    .map((p) => p.split("/").pop());
}

const problems = checkMigrations({
  migrations: list("supabase/migrations"),
  downs: list("supabase/down"),
  verifies: list("supabase/verify"),
  baseMigrations,
});

if (problems.length > 0) {
  for (const p of problems) console.error(`::error::${p}`);
  console.error(`\n${problems.length} migration problem(s).`);
  process.exit(1);
}
console.log(`Migration set is consistent${base ? ` (checked against ${base})` : ""}.`);
