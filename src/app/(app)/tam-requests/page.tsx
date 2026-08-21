import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { TamRequest } from "@/lib/types";
import { decideTamAction } from "./actions";

export const dynamic = "force-dynamic";

type RequestWithAccount = TamRequest & { portal_accounts: { name: string } | null };

const statusCls: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300",
  approved: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300",
  declined: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300",
  expired: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
};

export default async function TamRequestsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("portal_profiles")
    .select("role")
    .eq("id", user!.id)
    .single();
  const isAdmin = profile?.role === "admin";

  const { data: requests } = await supabase
    .from("portal_tam_requests")
    .select("*, portal_accounts(name)")
    .order("created_at", { ascending: false })
    .returns<RequestWithAccount[]>();

  const pending = (requests ?? []).filter((r) => r.status === "pending");
  const decided = (requests ?? []).filter((r) => r.status !== "pending");

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">TAM requests</h1>
        <Link
          href="/tam-requests/new"
          className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800"
        >
          Request a TAM
        </Link>
      </div>

      {pending.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-semibold text-slate-500">
            Pending ({pending.length})
          </h2>
          <div className="space-y-3">
            {pending.map((r) => (
              <div
                key={r.id}
                className="rounded-lg border border-amber-300 bg-white p-4 text-sm dark:border-amber-700 dark:bg-slate-900"
              >
                <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-semibold">{r.portal_accounts?.name ?? "Unknown account"}</span>
                    <span
                      className={`ml-2 rounded-full px-2 py-0.5 text-xs font-medium ${statusCls[r.status]}`}
                    >
                      {r.status}
                    </span>
                    <span className="ml-2 text-xs text-slate-400">urgency {r.urgency}</span>
                  </div>
                  <span className="text-xs text-slate-400">
                    {new Date(r.created_at).toLocaleString()}
                  </span>
                </div>
                <p className="mb-1">{r.justification}</p>
                <p className="text-xs text-slate-500">Requested by {r.requester_email}</p>
                {isAdmin && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                    <input
                      form={`approve-${r.id}`}
                      name="note"
                      placeholder="Optional note to the requester"
                      className="min-w-52 flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-xs dark:border-slate-600 dark:bg-slate-800"
                    />
                    <form id={`approve-${r.id}`} action={decideTamAction.bind(null, r.id, "approve")}>
                      <button
                        type="submit"
                        className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-800"
                      >
                        Approve
                      </button>
                    </form>
                    <form action={decideTamAction.bind(null, r.id, "decline")}>
                      <button
                        type="submit"
                        className="rounded-md border border-red-600 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                      >
                        Decline
                      </button>
                    </form>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-500">History</h2>
        <div className="space-y-3">
          {decided.map((r) => (
            <div
              key={r.id}
              className="rounded-lg border border-slate-200 bg-white p-4 text-sm dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-semibold">{r.portal_accounts?.name ?? "Unknown account"}</span>
                  <span
                    className={`ml-2 rounded-full px-2 py-0.5 text-xs font-medium ${statusCls[r.status]}`}
                  >
                    {r.status}
                  </span>
                </div>
                <span className="text-xs text-slate-400">
                  {r.decided_at
                    ? `decided ${new Date(r.decided_at).toLocaleString()} via ${r.decided_via}`
                    : new Date(r.created_at).toLocaleString()}
                </span>
              </div>
              <p className="mb-1">{r.justification}</p>
              <p className="text-xs text-slate-500">
                Requested by {r.requester_email}
                {r.decision_note && ` — "${r.decision_note}"`}
              </p>
            </div>
          ))}
          {decided.length === 0 && pending.length === 0 && (
            <p className="py-8 text-center text-sm text-slate-400">No TAM requests yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}
