import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ApiKey } from "@/lib/types";
import { CreateApiKeyForm } from "@/components/admin/CreateApiKeyForm";
import { revokeApiKeyAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function ApiKeysPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("portal_profiles")
    .select("role")
    .eq("id", user!.id)
    .single();
  if (profile?.role !== "admin") redirect("/pipeline");

  // RLS: only admins can select from portal_api_keys.
  const { data: keys } = await supabase
    .from("portal_api_keys")
    .select("*")
    .order("created_at", { ascending: false })
    .returns<ApiKey[]>();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="mb-1 text-xl font-semibold">API keys</h1>
        <p className="text-sm text-slate-500">
          One key per integration, least-privilege scopes. Keys are hashed at rest and shown
          exactly once at creation. External tools call{" "}
          <code className="text-xs">/api/v1/*</code> with{" "}
          <code className="text-xs">Authorization: Bearer &lt;key&gt;</code>.
        </p>
      </div>

      <CreateApiKeyForm />

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700">
              <th className="px-4 py-2.5">Name</th>
              <th className="px-4 py-2.5">Key</th>
              <th className="px-4 py-2.5">Scopes</th>
              <th className="px-4 py-2.5">Last used</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {(keys ?? []).map((k) => (
              <tr key={k.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                <td className="px-4 py-2.5 font-medium">{k.name}</td>
                <td className="px-4 py-2.5 font-mono text-xs">{k.key_prefix}…</td>
                <td className="px-4 py-2.5">
                  <div className="flex flex-wrap gap-1">
                    {k.scopes.map((s) => (
                      <code
                        key={s}
                        className="rounded bg-slate-100 px-1.5 py-0.5 text-xs dark:bg-slate-800"
                      >
                        {s}
                      </code>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-2.5 text-xs text-slate-500">
                  {k.last_used_at ? new Date(k.last_used_at).toLocaleString() : "never"}
                </td>
                <td className="px-4 py-2.5">
                  {k.revoked_at ? (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/50 dark:text-red-300">
                      revoked
                    </span>
                  ) : (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300">
                      active
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right">
                  {!k.revoked_at && (
                    <form action={revokeApiKeyAction.bind(null, k.id)}>
                      <button type="submit" className="text-xs text-red-600 hover:underline">
                        Revoke
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
            {(keys ?? []).length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-400">
                  No keys yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
