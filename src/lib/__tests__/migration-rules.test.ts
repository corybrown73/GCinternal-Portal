import { readdirSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  checkMigrations,
  combinedVerifySql,
  verifyStatement,
  versionOf,
} from "../../../scripts/lib/migration-rules.mjs";

describe("migration versions", () => {
  it("reads the number from a well-formed name only", () => {
    expect(versionOf("0090_customer_contacts_internal_only.sql")).toBe(90);
    expect(versionOf("0084_claim_concurrency.sh")).toBeNull();
    expect(versionOf("90_short.sql")).toBeNull();
    expect(versionOf("0090-Dashes.sql")).toBeNull();
  });
});

describe("checkMigrations", () => {
  it("accepts a clean set", () => {
    expect(
      checkMigrations({
        migrations: ["0085_a.sql", "0086_b.sql"],
        baseMigrations: ["0085_a.sql", "0086_b.sql"],
      }),
    ).toEqual([]);
  });

  it("refuses two migrations with one version", () => {
    const problems = checkMigrations({ migrations: ["0087_a.sql", "0087_b.sql"] });
    expect(problems.join("\n")).toMatch(/version 0087 is used by 2 migrations/);
  });

  it("refuses a name that is not NNNN_snake_case.sql", () => {
    expect(checkMigrations({ migrations: ["087_a.sql"] }).join("\n")).toMatch(/not named/);
  });

  it("refuses a new migration that takes a version already on the base branch", () => {
    const problems = checkMigrations({
      migrations: ["0086_b.sql", "0087_mine.sql"],
      downs: ["0087_down.sql"],
      verifies: ["0087_verify.sql"],
      baseMigrations: ["0086_b.sql", "0087_theirs.sql"],
    });
    expect(problems.join("\n")).toMatch(/0087_mine.sql: version 0087 is already 0087_theirs.sql/);
  });

  it("refuses a new migration numbered below the newest on the base branch", () => {
    const problems = checkMigrations({
      migrations: ["0086_b.sql", "0087_mine.sql"],
      downs: ["0087_down.sql"],
      verifies: ["0087_verify.sql"],
      baseMigrations: ["0086_b.sql", "0089_theirs.sql"],
    });
    expect(problems.join("\n")).toMatch(/older than 0089/);
  });

  it("does not fault a migration that is already on the base branch", () => {
    expect(
      checkMigrations({
        migrations: ["0086_b.sql", "0089_theirs.sql"],
        downs: ["0089_down.sql"],
        verifies: ["0089_verify.sql"],
        baseMigrations: ["0086_b.sql", "0089_theirs.sql"],
      }),
    ).toEqual([]);
  });

  it("requires a down script and a verify file from 0087 on, not before", () => {
    const problems = checkMigrations({ migrations: ["0086_old.sql", "0087_new.sql"] });
    expect(problems).toHaveLength(2);
    expect(problems.join("\n")).toMatch(/0087_new.sql: no supabase\/down\/0087_down.sql/);
    expect(problems.join("\n")).toMatch(/0087_new.sql: no supabase\/verify\/0087_verify.sql/);
  });

  it("refuses a verify file with no migration", () => {
    expect(
      checkMigrations({ migrations: ["0086_a.sql"], verifies: ["0095_verify.sql"] }).join("\n"),
    ).toMatch(/there is no migration 0095/);
  });
});

describe("verify files", () => {
  const select = "select '0090' as migration, 'x' as requirement, true as ok";

  it("accepts one read-only SELECT, ignoring comments and a trailing semicolon", () => {
    expect(verifyStatement("v.sql", `-- note\n${select};\n`)).toBe(select);
  });

  it("refuses anything that is not a single read-only SELECT", () => {
    expect(() => verifyStatement("v.sql", "drop table x")).toThrow(/single SELECT/);
    expect(() => verifyStatement("v.sql", `${select}; ${select}`)).toThrow(/one statement/);
    expect(() => verifyStatement("v.sql", "select 1 from (delete from t returning 1) d")).toThrow(
      /read-only/,
    );
  });

  it("joins the files into one query, optionally keeping only the failing rows", () => {
    const files = [
      { name: "a.sql", text: select },
      { name: "b.sql", text: select },
    ];
    const all = combinedVerifySql(files);
    expect(all).toContain("union all");
    expect(all).not.toContain("where not ok");
    expect(combinedVerifySql(files, { failingOnly: true })).toContain("where not ok");
  });

  it("every committed verify file is a valid single read-only SELECT", () => {
    const dir = "supabase/verify";
    for (const name of readdirSync(dir)) {
      expect(() => verifyStatement(name, readFileSync(`${dir}/${name}`, "utf8"))).not.toThrow();
    }
  });

  it("the committed migration set passes its own rules", () => {
    const list = (d: string) => readdirSync(d).filter((f) => f.endsWith(".sql"));
    expect(
      checkMigrations({
        migrations: list("supabase/migrations"),
        downs: list("supabase/down"),
        verifies: list("supabase/verify"),
      }),
    ).toEqual([]);
  });
});
