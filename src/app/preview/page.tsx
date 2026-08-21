import Link from "next/link";
import { notFound } from "next/navigation";
import { Board } from "@/components/kanban/Board";
import { StageBadge } from "@/components/StageBadge";
import type { Account } from "@/lib/types";

// Design preview: renders the real UI components with demo data — no login, no
// database. Enabled in dev, or anywhere with PORTAL_PREVIEW_ENABLED=true.
// Drag-and-drop is visual only here (transitions need a signed-in session).

export const dynamic = "force-dynamic";

function demo(partial: Partial<Account> & { name: string; stage: Account["stage"] }): Account {
  return {
    id: crypto.randomUUID(),
    domain: null,
    salesforce_id: null,
    arr: null,
    products: [],
    am_owner_id: null,
    se_owner_id: null,
    summary: null,
    stage_entered_at: new Date(Date.now() - 6 * 86400000).toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...partial,
  };
}

const DEMO_ACCOUNTS: Account[] = [
  demo({ name: "Summit Field Services", stage: "prospect", arr: 18000 }),
  demo({ name: "Ironline Utilities", stage: "prospect", arr: 42000 }),
  demo({ name: "Acme Manufacturing", stage: "closed_won", arr: 48000, salesforce_id: "0018b00002QzXyz" }),
  demo({ name: "BlueRiver Inspections", stage: "onboarding_kickoff", arr: 27500 }),
  demo({ name: "Corewell Energy", stage: "in_onboarding", arr: 96000 }),
  demo({ name: "Harbor Facilities Group", stage: "in_onboarding", arr: 31000 }),
  demo({ name: "Northgate Construction", stage: "onboarding_complete", arr: 55000 }),
];

export default function PreviewPage() {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.PORTAL_PREVIEW_ENABLED !== "true"
  ) {
    notFound();
  }

  return (
    <div className="min-h-screen">
      <div className="bg-amber-100 px-4 py-1.5 text-center text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
        Design preview — demo data, no sign-in. The live app requires an account.
      </div>
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-8">
            <span className="text-lg font-bold text-emerald-700 dark:text-emerald-400">
              GoCanvas <span className="font-normal text-slate-400">Handoff</span>
            </span>
            <nav className="flex items-center gap-5 text-sm font-medium text-slate-600 dark:text-slate-300">
              <span className="text-emerald-700 dark:text-emerald-400">Pipeline</span>
              <span>Accounts</span>
              <span>TAM Requests</span>
              <span>Admin</span>
            </nav>
          </div>
          <span className="text-sm text-slate-500">you@gocanvas.com</span>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-xl font-semibold">Pipeline</h1>
          <span className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white">
            New account
          </span>
        </div>
        <Board accounts={DEMO_ACCOUNTS} />

        <div className="mt-10 rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-1 flex items-center gap-3">
            <h2 className="text-2xl font-semibold">Acme Manufacturing</h2>
            <StageBadge stage="closed_won" />
          </div>
          <p className="mb-4 text-sm text-slate-500">
            acme.com <span className="ml-2 font-mono text-xs">SF 0018b00002QzXyz</span>
            <span className="ml-3">$48,000 ARR</span>
          </p>
          <div className="flex gap-1 border-b border-slate-200 text-sm dark:border-slate-700">
            {["Overview", "Gong reports", "Briefs", "TAM", "Notes", "History"].map((t, i) => (
              <span
                key={t}
                className={`-mb-px border-b-2 px-3 py-2 font-medium ${
                  i === 0
                    ? "border-emerald-700 text-emerald-700 dark:border-emerald-400 dark:text-emerald-400"
                    : "border-transparent text-slate-500"
                }`}
              >
                {t}
              </span>
            ))}
          </div>
          <p className="pt-4 text-sm text-slate-500">
            ↑ The account detail page: stage controls, Gong report intake, brief generation
            with discovery questions, TAM status, onboarding notes, and full stage history.
          </p>
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          <Link href="/login" className="underline">Go to the real sign-in</Link>
        </p>
      </main>
    </div>
  );
}
