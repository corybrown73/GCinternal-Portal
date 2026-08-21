import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import { signOut } from "./auth-actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("portal_profiles")
    .select("*")
    .eq("id", user.id)
    .single<Profile>();

  const isAdmin = profile?.role === "admin";

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-8">
            <Link href="/pipeline" className="text-lg font-bold text-emerald-700 dark:text-emerald-400">
              GoCanvas <span className="font-normal text-slate-400">Handoff</span>
            </Link>
            <nav className="flex items-center gap-5 text-sm font-medium text-slate-600 dark:text-slate-300">
              <Link href="/pipeline" className="hover:text-emerald-700 dark:hover:text-emerald-400">
                Pipeline
              </Link>
              <Link href="/accounts" className="hover:text-emerald-700 dark:hover:text-emerald-400">
                Accounts
              </Link>
              <Link href="/tam-requests" className="hover:text-emerald-700 dark:hover:text-emerald-400">
                TAM Requests
              </Link>
              {isAdmin && (
                <Link href="/admin" className="hover:text-emerald-700 dark:hover:text-emerald-400">
                  Admin
                </Link>
              )}
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-slate-500 dark:text-slate-400">
              {profile?.full_name || profile?.email}
            </span>
            <form action={signOut}>
              <button
                type="submit"
                className="rounded-md border border-slate-300 px-3 py-1 text-xs hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
