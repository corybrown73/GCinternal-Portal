import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Account } from "@/lib/types";
import { StageBadge } from "@/components/StageBadge";

export const dynamic = "force-dynamic";

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const supabase = await createClient();

  let query = supabase.from("portal_accounts").select("*").order("updated_at", { ascending: false });
  if (q) query = query.ilike("name", `%${q}%`);
  const { data: accounts } = await query.returns<Account[]>();

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Accounts</h1>
        <div className="flex items-center gap-2">
          <form className="flex items-center gap-2">
            <input
              type="search"
              name="q"
              defaultValue={q ?? ""}
              placeholder="Search accounts…"
              className="w-56 rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-emerald-600 focus:outline-none dark:border-slate-600 dark:bg-slate-800"
            />
          </form>
          <Link
            href="/admin/import"
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
          >
            Import CSV
          </Link>
          <Link
            href="/accounts/new"
            className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800"
          >
            New account
          </Link>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700">
              <th className="px-4 py-2.5">Account</th>
              <th className="px-4 py-2.5">Stage</th>
              <th className="px-4 py-2.5">ARR</th>
              <th className="px-4 py-2.5">Salesforce ID</th>
              <th className="px-4 py-2.5">Updated</th>
            </tr>
          </thead>
          <tbody>
            {(accounts ?? []).map((a) => (
              <tr
                key={a.id}
                className="border-b border-slate-100 last:border-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
              >
                <td className="px-4 py-2.5">
                  <Link href={`/accounts/${a.id}`} className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">
                    {a.name}
                  </Link>
                  {a.domain && <span className="ml-2 text-xs text-slate-400">{a.domain}</span>}
                </td>
                <td className="px-4 py-2.5">
                  <StageBadge stage={a.stage} />
                </td>
                <td className="px-4 py-2.5 tabular-nums">
                  {a.arr ? `$${Number(a.arr).toLocaleString()}` : "—"}
                </td>
                <td className="px-4 py-2.5 font-mono text-xs">{a.salesforce_id ?? "—"}</td>
                <td className="px-4 py-2.5 text-xs text-slate-500">
                  {new Date(a.updated_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
            {(accounts ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-400">
                  No accounts yet. Create one, import a CSV, or push one through the API.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
