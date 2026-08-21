"use client";

import { createClient } from "@/lib/supabase/client";

// Ships dark: renders nothing until NEXT_PUBLIC_AUTH_MICROSOFT_ENABLED=true.
// When IT approves the Entra app registration, configure the Azure provider in
// Supabase Auth settings and flip the flag — no code changes (see README).
export function MicrosoftSignInButton() {
  if (process.env.NEXT_PUBLIC_AUTH_MICROSOFT_ENABLED !== "true") {
    return null;
  }

  async function signIn() {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "azure",
      options: {
        scopes: "email",
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  }

  return (
    <>
      <div className="my-4 flex items-center gap-3 text-xs text-slate-400">
        <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
        or continue with
        <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
      </div>
      <button
        type="button"
        onClick={signIn}
        className="flex w-full items-center justify-center gap-2 rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
      >
        <svg width="16" height="16" viewBox="0 0 21 21" aria-hidden="true">
          <rect x="1" y="1" width="9" height="9" fill="#f25022" />
          <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
          <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
          <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
        </svg>
        Sign in with Microsoft
      </button>
    </>
  );
}
