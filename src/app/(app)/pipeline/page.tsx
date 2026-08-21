import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Account } from "@/lib/types";
import { Board } from "@/components/kanban/Board";

export const dynamic = "force-dynamic";

export default async function PipelinePage() {
  const supabase = await createClient();
  const { data: accounts } = await supabase
    .from("portal_accounts")
    .select("*")
    .order("stage_entered_at", { ascending: true })
    .returns<Account[]>();

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Pipeline</h1>
        <Link
          href="/accounts/new"
          className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800"
        >
          New account
        </Link>
      </div>
      <Board accounts={accounts ?? []} />
    </div>
  );
}
