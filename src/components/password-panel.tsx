import { useState } from "react";
import { KeyRound } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";

/**
 * Change your own password, signed in. No old password is asked for: the
 * session is the proof, and the reset link on the sign-in page covers the
 * person who has forgotten it.
 */
export function PasswordPanel() {
  const [pw, setPw] = useState("");
  const [again, setAgain] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const ok = pw.length >= 12 && pw === again;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ok) return;
    setState("busy");
    setMessage(null);
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) {
      setState("error");
      setMessage(error.message);
      return;
    }
    setPw("");
    setAgain("");
    setState("done");
    setMessage("Password changed.");
  };

  return (
    <section className="overflow-hidden rounded-md border border-border bg-card">
      <header className="border-b border-border px-4 py-2.5">
        <h2 className="flex items-center gap-1.5 text-[13px] font-semibold">
          <KeyRound className="h-3.5 w-3.5" /> Password
        </h2>
        <p className="mt-0.5 text-[11.5px] text-muted-foreground">
          Choose a new one for your own sign-in. At least 12 characters.
        </p>
      </header>
      <form className="flex flex-wrap items-end gap-3 px-4 py-3" onSubmit={(e) => void submit(e)}>
        <label className="space-y-1">
          <span className="block text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
            New password
          </span>
          <input
            type="password"
            autoComplete="new-password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            className="h-7 w-56 rounded-sm border border-border bg-background px-2 text-[12px] outline-none focus:ring-1 focus:ring-ring"
          />
        </label>
        <label className="space-y-1">
          <span className="block text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
            Again
          </span>
          <input
            type="password"
            autoComplete="new-password"
            value={again}
            onChange={(e) => setAgain(e.target.value)}
            className="h-7 w-56 rounded-sm border border-border bg-background px-2 text-[12px] outline-none focus:ring-1 focus:ring-ring"
          />
        </label>
        <button
          type="submit"
          disabled={!ok || state === "busy"}
          className="h-7 rounded-sm border border-border px-2.5 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          {state === "busy" ? "Saving…" : "Change password"}
        </button>
        {pw && again && pw !== again ? (
          <span className="text-[11px] text-destructive">The two do not match.</span>
        ) : null}
        {message ? (
          <span
            className={
              state === "error"
                ? "text-[11px] text-destructive"
                : "text-[11px] text-emerald-700 dark:text-emerald-400"
            }
          >
            {message}
          </span>
        ) : null}
      </form>
    </section>
  );
}
