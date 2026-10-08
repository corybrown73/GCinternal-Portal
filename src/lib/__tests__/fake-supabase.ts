/**
 * An in-memory stand-in for the service-role Supabase client.
 *
 * Not a test itself (vitest only collects *.test.ts). It exists so the external
 * portal's authorization suite can exercise the REAL server modules — the same
 * `loadSharedPlan`, the same action functions — rather than a paraphrase of
 * them. Every query shape those modules use is implemented here and nothing
 * else: if a module starts using a new operator, the fake throws rather than
 * silently returning everything, because a filter that quietly does nothing is
 * exactly how an isolation test passes while the product leaks.
 *
 * Database TRIGGERS are deliberately NOT emulated (revocation on contact
 * delete, on implementation close, and the grant immutability checks). Those
 * are SQL guarantees and are verified as SQL; faking them here would only test
 * the fake. What is tested here is the app's half: a revoked grant stops
 * working, whoever revoked it.
 */

// Rows are `any` on purpose: a fixture is shaped like a database row, and
// the suite reads columns by name without a generated type in the way.
export type Rows = Record<string, any[]>;

type Op =
  | { kind: "select" }
  | { kind: "insert"; values: Record<string, any>[] }
  | { kind: "upsert"; values: Record<string, any>[]; onConflict: string[] }
  | { kind: "update"; patch: Record<string, any> }
  | { kind: "delete" };

class Builder implements PromiseLike<{ data: any; error: any }> {
  private filters: Array<(row: any) => boolean> = [];
  private op: Op = { kind: "select" };
  private orderBy: Array<{ col: string; asc: boolean }> = [];
  private limitTo: number | null = null;

  constructor(
    private readonly table: string,
    private readonly store: Rows,
    private readonly log: { inserts: Array<{ table: string; row: any }> },
  ) {}

  private rows(): any[] {
    return (this.store[this.table] ??= []);
  }

  select(_cols?: string): this {
    return this;
  }

  eq(col: string, value: unknown): this {
    this.filters.push((r) => r[col] === value);
    return this;
  }

  neq(col: string, value: unknown): this {
    this.filters.push((r) => r[col] !== value);
    return this;
  }

  is(col: string, value: unknown): this {
    this.filters.push((r) => (r[col] ?? null) === value);
    return this;
  }

  in(col: string, values: unknown[]): this {
    this.filters.push((r) => values.includes(r[col]));
    return this;
  }

  gte(col: string, value: string): this {
    this.filters.push((r) => String(r[col] ?? "") >= value);
    return this;
  }

  gt(col: string, value: string): this {
    this.filters.push((r) => String(r[col] ?? "") > value);
    return this;
  }

  lt(col: string, value: string): this {
    this.filters.push((r) => String(r[col] ?? "") < value);
    return this;
  }

  lte(col: string, value: string): this {
    this.filters.push((r) => String(r[col] ?? "") <= value);
    return this;
  }

  ilike(col: string, value: string): this {
    const needle = value.replaceAll("%", "").toLowerCase();
    this.filters.push((r) => String(r[col] ?? "").toLowerCase() === needle);
    return this;
  }

  not(col: string, operator: string, value: string): this {
    if (operator !== "in") throw new Error(`fake-supabase: unsupported not(${operator})`);
    const list = value
      .replace(/^\(/, "")
      .replace(/\)$/, "")
      .split(",")
      .map((s) => s.trim().replace(/^"|"$/g, ""));
    this.filters.push((r) => !list.includes(String(r[col])));
    return this;
  }

  order(col: string, opts?: { ascending?: boolean }): this {
    this.orderBy.push({ col, asc: opts?.ascending !== false });
    return this;
  }

  limit(n: number): this {
    this.limitTo = n;
    return this;
  }

  insert(values: Record<string, any> | Record<string, any>[]): this {
    this.op = { kind: "insert", values: Array.isArray(values) ? values : [values] };
    return this;
  }

  /** Merge-duplicates only, as the app uses it: a row matching every `onConflict` column is updated in place. */
  upsert(
    values: Record<string, any> | Record<string, any>[],
    opts: { onConflict?: string } = {},
  ): this {
    if (!opts.onConflict) throw new Error("fake-supabase: upsert needs onConflict");
    this.op = {
      kind: "upsert",
      values: Array.isArray(values) ? values : [values],
      onConflict: opts.onConflict.split(",").map((c) => c.trim()),
    };
    return this;
  }

  update(patch: Record<string, any>): this {
    this.op = { kind: "update", patch };
    return this;
  }

  delete(): this {
    this.op = { kind: "delete" };
    return this;
  }

  private matching(): any[] {
    let out = this.rows().filter((r) => this.filters.every((f) => f(r)));
    for (const { col, asc } of [...this.orderBy].reverse()) {
      out = [...out].sort((a, b) => {
        const av = String(a[col] ?? "");
        const bv = String(b[col] ?? "");
        return av === bv ? 0 : (av < bv ? -1 : 1) * (asc ? 1 : -1);
      });
    }
    if (this.limitTo !== null) out = out.slice(0, this.limitTo);
    return out;
  }

  private run(): { data: any; error: any } {
    if (this.op.kind === "insert") {
      const created = this.op.values.map((v) => ({
        id: v["id"] ?? `${this.table}-${Math.random().toString(16).slice(2, 10)}`,
        created_at: v["created_at"] ?? new Date().toISOString(),
        ...v,
      }));
      this.rows().push(...created);
      for (const row of created) this.log.inserts.push({ table: this.table, row });
      return { data: created, error: null };
    }
    if (this.op.kind === "upsert") {
      const { onConflict } = this.op;
      const out: any[] = [];
      for (const v of this.op.values) {
        const existing = this.rows().find((r) => onConflict.every((c) => r[c] === v[c]));
        if (existing) {
          Object.assign(existing, v);
          out.push(existing);
          continue;
        }
        const created = {
          id: v["id"] ?? `${this.table}-${Math.random().toString(16).slice(2, 10)}`,
          created_at: v["created_at"] ?? new Date().toISOString(),
          ...v,
        };
        this.rows().push(created);
        this.log.inserts.push({ table: this.table, row: created });
        out.push(created);
      }
      return { data: out, error: null };
    }
    if (this.op.kind === "update") {
      const hit = this.matching();
      for (const row of hit) Object.assign(row, this.op.patch);
      return { data: hit, error: null };
    }
    if (this.op.kind === "delete") {
      const hit = this.matching();
      this.store[this.table] = this.rows().filter((r) => !hit.includes(r));
      return { data: hit, error: null };
    }
    return { data: this.matching(), error: null };
  }

  async maybeSingle(): Promise<{ data: any; error: any }> {
    const { data, error } = this.run();
    return { data: (data as any[])[0] ?? null, error };
  }

  async single(): Promise<{ data: any; error: any }> {
    const { data, error } = this.run();
    const row = (data as any[])[0] ?? null;
    return row ? { data: row, error } : { data: null, error: { message: "no rows" } };
  }

  then<TResult1 = { data: any; error: any }, TResult2 = never>(
    onfulfilled?: ((value: { data: any; error: any }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.run()).then(onfulfilled, onrejected);
  }
}

export type FakeSupabase = {
  client: any;
  store: Rows;
  inserts: Array<{ table: string; row: any }>;
  uploads: Array<{ bucket: string; path: string; bytes: number; contentType: string }>;
  /** Object bytes by "bucket/path", for `download`; seed it for a stored SOW. */
  objects: Map<string, Uint8Array>;
  /** Every `rpc` call, in order. */
  rpcs: Array<{ fn: string; args: Record<string, any> }>;
};

export function createFakeSupabase(
  initial: Rows,
  options: { objects?: Record<string, Uint8Array> } = {},
): FakeSupabase {
  const store: Rows = JSON.parse(JSON.stringify(initial));
  const log = { inserts: [] as Array<{ table: string; row: any }> };
  const uploads: FakeSupabase["uploads"] = [];
  const objects = new Map<string, Uint8Array>(Object.entries(options.objects ?? {}));
  const rpcs: FakeSupabase["rpcs"] = [];

  const client = {
    from: (table: string) => new Builder(table, store, log),
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string, bytes: Uint8Array, opts?: { contentType?: string }) => {
          uploads.push({
            bucket,
            path,
            bytes: bytes.byteLength,
            contentType: opts?.contentType ?? "",
          });
          objects.set(`${bucket}/${path}`, bytes);
          return { data: { path }, error: null };
        },
        download: async (path: string) => {
          const bytes = objects.get(`${bucket}/${path}`);
          if (!bytes) return { data: null, error: { message: "Object not found" } };
          return { data: new Blob([bytes as BlobPart]), error: null };
        },
        remove: async (_paths: string[]) => ({ data: null, error: null }),
      }),
    },
    // The one RPC the AI path uses: 0062's merge into `portal_accounts.intake`
    // — patch keys replace top-level keys, timeline keys merge into
    // intake.timeline. Emulated so a merge-only writer can be exercised here.
    rpc: async (fn: string, args: Record<string, any>) => {
      rpcs.push({ fn, args });
      if (fn !== "portal_merge_intake") {
        return { data: null, error: { message: `fake-supabase: unsupported rpc ${fn}` } };
      }
      const row = (store["portal_accounts"] ?? []).find((r) => r["id"] === args["p_account"]);
      if (!row) return { data: null, error: null };
      const intake = { ...(row["intake"] ?? {}), ...(args["p_patch"] ?? {}) };
      if (args["p_timeline"]) {
        intake["timeline"] = { ...(intake["timeline"] ?? {}), ...args["p_timeline"] };
      }
      row["intake"] = intake;
      row["updated_at"] = new Date().toISOString();
      return { data: intake, error: null };
    },
  };

  return { client, store, inserts: log.inserts, uploads, objects, rpcs };
}
