import { createClient } from "@/lib/supabase/server";
import type { Account } from "@/lib/types";
import { createTamRequestFromForm } from "../actions";

const inputCls =
  "w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-emerald-600 focus:outline-none dark:border-slate-600 dark:bg-slate-800";

export default async function NewTamRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string }>;
}) {
  const { account: preselected } = await searchParams;
  const supabase = await createClient();
  const { data: accounts } = await supabase
    .from("portal_accounts")
    .select("id, name")
    .order("name")
    .returns<Pick<Account, "id" | "name">[]>();

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-1 text-xl font-semibold">Request a TAM</h1>
      <p className="mb-4 text-sm text-slate-500">
        Your request goes to the SE leadership team for a one-click decision. You&apos;ll get
        an email either way, and the status shows on the account.
      </p>
      <form
        action={createTamRequestFromForm}
        className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
      >
        <div>
          <label htmlFor="account_id" className="mb-1 block text-sm font-medium">
            Account
          </label>
          <select
            id="account_id"
            name="account_id"
            required
            defaultValue={preselected ?? ""}
            className={inputCls}
          >
            <option value="" disabled>
              Choose an account…
            </option>
            {(accounts ?? []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="urgency" className="mb-1 block text-sm font-medium">
            Urgency
          </label>
          <select id="urgency" name="urgency" defaultValue="medium" className={inputCls}>
            <option value="low">Low — nice to have</option>
            <option value="medium">Medium — needed for success</option>
            <option value="high">High — at-risk without one</option>
          </select>
        </div>
        <div>
          <label htmlFor="justification" className="mb-1 block text-sm font-medium">
            Why does this account need a TAM?
          </label>
          <textarea
            id="justification"
            name="justification"
            rows={4}
            required
            minLength={10}
            placeholder="Complex integration footprint, exec sponsor expects weekly technical touchpoints…"
            className={inputCls}
          />
        </div>
        <button
          type="submit"
          className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
        >
          Submit request
        </button>
      </form>
    </div>
  );
}
