// The rules a migration set must satisfy before it can merge. Pure functions
// over file names, so CI, the CLI and the unit test run the same code.
//
// WHY THESE RULES. A migration is applied to production by hand, in the order
// its number says. Two files with one number, or a new file numbered below one
// already merged, make that order ambiguous and the production state
// unknowable. And code that needs a migration production does not have yet is
// the failure that turned every list in the app into "no accounts" (the
// implementation-closure incident). Each migration after VERIFY_REQUIRED_FROM
// therefore ships a down script and a read-only verify file, so the person who
// applies it can prove it landed before the dependent code merges.

/** Migrations from this number on need a down script and a verify file. */
export const VERIFY_REQUIRED_FROM = 87;

const MIGRATION_NAME = /^(\d{4})_[a-z0-9_]+\.sql$/;

/** The numeric version of `0090_x.sql`, or null for any other name. */
export function versionOf(file) {
  const m = MIGRATION_NAME.exec(file);
  return m ? Number(m[1]) : null;
}

const pad = (n) => String(n).padStart(4, "0");

/**
 * @param {object} input
 * @param {string[]} input.migrations file names in supabase/migrations
 * @param {string[]} [input.downs] file names in supabase/down
 * @param {string[]} [input.verifies] file names in supabase/verify
 * @param {string[] | null} [input.baseMigrations] file names on the base branch
 * @returns {string[]} one human-readable problem per entry; empty means fine
 */
export function checkMigrations({ migrations, downs = [], verifies = [], baseMigrations = null }) {
  const problems = [];

  const byVersion = new Map();
  for (const file of migrations) {
    const v = versionOf(file);
    if (v === null) {
      problems.push(`${file}: not named NNNN_lower_snake_case.sql`);
      continue;
    }
    byVersion.set(v, [...(byVersion.get(v) ?? []), file]);
  }

  for (const [v, files] of byVersion) {
    if (files.length > 1) {
      problems.push(`version ${pad(v)} is used by ${files.length} migrations: ${files.join(", ")}`);
    }
  }

  if (baseMigrations) {
    const base = new Set(baseMigrations);
    const baseVersions = new Map();
    for (const file of baseMigrations) {
      const v = versionOf(file);
      if (v !== null) baseVersions.set(v, file);
    }
    const newest = Math.max(0, ...baseVersions.keys());
    for (const file of migrations) {
      const v = versionOf(file);
      if (v === null || base.has(file)) continue;
      const taken = baseVersions.get(v);
      if (taken) {
        problems.push(`${file}: version ${pad(v)} is already ${taken} on the base branch`);
      } else if (v < newest) {
        problems.push(
          `${file}: older than ${pad(newest)}, the newest migration on the base branch; a new migration must be numbered after it`,
        );
      }
    }
  }

  const down = new Set(downs);
  const verify = new Set(verifies);
  for (const [v, files] of byVersion) {
    if (v < VERIFY_REQUIRED_FROM) continue;
    if (!down.has(`${pad(v)}_down.sql`)) {
      problems.push(`${files[0]}: no supabase/down/${pad(v)}_down.sql`);
    }
    if (!verify.has(`${pad(v)}_verify.sql`)) {
      problems.push(
        `${files[0]}: no supabase/verify/${pad(v)}_verify.sql (the read-only check run against production before the dependent code merges)`,
      );
    }
  }
  for (const file of verifies) {
    const m = /^(\d{4})_verify\.sql$/.exec(file);
    if (!m) {
      problems.push(`supabase/verify/${file}: not named NNNN_verify.sql`);
    } else if (!byVersion.has(Number(m[1]))) {
      problems.push(`supabase/verify/${file}: there is no migration ${m[1]}`);
    }
  }

  return problems;
}

/**
 * A verify file is one read-only SELECT returning (migration, requirement, ok).
 * Returns its text without comments-only tails or a trailing semicolon, or
 * throws when it is not a single SELECT.
 */
export function verifyStatement(file, text) {
  const code = text
    .split("\n")
    .filter((line) => !/^\s*--/.test(line))
    .join("\n")
    .trim()
    .replace(/;\s*$/, "");
  if (!/^select\b/i.test(code)) throw new Error(`${file}: must be a single SELECT`);
  if (code.includes(";")) throw new Error(`${file}: must be one statement, with no ";" inside`);
  if (/\b(insert|update|delete|drop|alter|create|truncate|grant|revoke)\b/i.test(code)) {
    throw new Error(`${file}: must be read-only`);
  }
  return code;
}

/**
 * One query that returns a row per requirement across the given verify files:
 * (migration, requirement, ok). `failingOnly` keeps just the rows with ok false.
 */
export function combinedVerifySql(files, { failingOnly = false } = {}) {
  if (files.length === 0) throw new Error("no verify files selected");
  const parts = files.map(({ name, text }) => `(${verifyStatement(name, text)})`);
  const where = failingOnly ? "\n where not ok" : "";
  return `select * from (\n${parts.join("\nunion all\n")}\n) v${where}\n order by migration, requirement;`;
}
