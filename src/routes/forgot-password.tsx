import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/forgot-password")({
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Whose password the form will set. Shown on the form, because the account
  // a reset link signs in is the LINK's, and in a browser where somebody else
  // was already signed in that is not obvious until it is too late.
  const [recoveryFor, setRecoveryFor] = useState<string | null>(null);

  // The reset link lands on /auth/callback, which signs the link's account in
  // and comes here with ?recovery=1. Only then is this the set-password form.
  useEffect(() => {
    const arrivedByLink =
      window.location.search.includes("recovery=1") ||
      window.location.hash.includes("type=recovery");
    if (!arrivedByLink) return;
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setRecoveryFor(data.session.user.email ?? "this account");
    });
  }, []);

  async function requestReset(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/forgot-password`,
    });
    setBusy(false);
    setSent(true);
  }

  async function setPassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword.length < 12) {
      setError("Password must be at least 12 characters.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setBusy(false);
    if (error) {
      setError("Couldn't set the new password — the link may have expired. Request a new one.");
      return;
    }
    window.location.href = "/";
  }

  const showSetForm = recoveryFor !== null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="text-lg font-semibold tracking-tight">GoCanvas Handoff Hub</div>
          <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Password reset
          </p>
        </div>
        <div className="rounded-md border border-border bg-card p-5">
          {showSetForm ? (
            <form onSubmit={setPassword} className="flex flex-col gap-3">
              <p className="text-[12px] text-muted-foreground">
                Setting a new password for <b className="text-foreground">{recoveryFor}</b>. Not
                you?{" "}
                <button
                  type="button"
                  className="underline underline-offset-2"
                  onClick={async () => {
                    await supabase.auth.signOut();
                    window.location.href = "/login";
                  }}
                >
                  Sign out
                </button>
                .
              </p>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="new-password">
                  New password{" "}
                  <span className="font-normal text-muted-foreground">(12+ characters)</span>
                </Label>
                <Input
                  id="new-password"
                  type="password"
                  required
                  minLength={12}
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>
              {error && <p className="text-[13px] text-destructive">{error}</p>}
              <Button type="submit" disabled={busy}>
                {busy ? "Saving…" : "Save password"}
              </Button>
            </form>
          ) : sent ? (
            <div className="py-3 text-center">
              <p className="text-[13px] font-medium">Check your inbox</p>
              <p className="mt-1 text-[12px] text-muted-foreground">
                If an account exists for <b>{email}</b>, a reset link is on its way.
              </p>
            </div>
          ) : (
            <form onSubmit={requestReset} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="email">Work email</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <Button type="submit" disabled={busy}>
                {busy ? "Sending…" : "Send reset link"}
              </Button>
              <p className="text-center text-[12px]">
                <Link
                  to="/login"
                  className="text-muted-foreground underline-offset-2 hover:underline"
                >
                  Back to sign in
                </Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
