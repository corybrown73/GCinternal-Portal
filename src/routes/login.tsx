import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"internal" | "customer">("internal");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [linkSent, setLinkSent] = useState(false);

  async function signInInternal(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      setError(
        error.message === "Email not confirmed"
          ? "Your email isn't verified yet — check your inbox for the verification link."
          : "That email and password combination didn't work."
      );
      return;
    }
    navigate({ to: "/" });
  }

  async function sendCustomerLink(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    // Invited customers get a passwordless sign-in link. The database trigger
    // rejects anyone who is neither invited nor on the internal email domain.
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setBusy(false);
    if (error) {
      setError("We couldn't send a link to that address. Check with your GoCanvas contact.");
      return;
    }
    setLinkSent(true);
  }

  const microsoftEnabled = import.meta.env["VITE_AUTH_MICROSOFT_ENABLED"] === "true";

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="text-lg font-semibold tracking-tight">GoCanvas Handoff Hub</div>
          <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Sales · Onboarding · Implementation
          </p>
        </div>

        <div className="rounded-md border border-border bg-card p-5">
          <div className="mb-4 grid grid-cols-2 gap-1 rounded-sm bg-muted p-0.5">
            {(
              [
                ["internal", "GoCanvas team"],
                ["customer", "Customer"],
              ] as const
            ).map(([m, label]) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m);
                  setError(null);
                  setLinkSent(false);
                }}
                className={`rounded-sm px-2 py-1.5 text-[13px] font-medium transition-colors ${
                  mode === m ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {mode === "internal" ? (
            <form onSubmit={signInInternal} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="email">Work email</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@gocanvas.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  <Link
                    to="/forgot-password"
                    className="text-[11px] text-muted-foreground underline-offset-2 hover:underline"
                  >
                    Forgot password?
                  </Link>
                </div>
                <Input
                  id="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              {error && <p className="text-[13px] text-destructive">{error}</p>}
              <Button type="submit" disabled={busy} className="mt-1">
                {busy ? "Signing in…" : "Sign in"}
              </Button>
              {microsoftEnabled && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    supabase.auth.signInWithOAuth({
                      provider: "azure",
                      options: {
                        scopes: "email",
                        redirectTo: `${window.location.origin}/auth/callback`,
                      },
                    })
                  }
                >
                  Sign in with Microsoft
                </Button>
              )}
              <p className="text-center text-[12px] text-muted-foreground">
                New here?{" "}
                <Link to="/signup" className="text-foreground underline-offset-2 hover:underline">
                  Create an account
                </Link>
              </p>
            </form>
          ) : linkSent ? (
            <div className="py-3 text-center">
              <p className="text-[13px] font-medium">Check your inbox</p>
              <p className="mt-1 text-[12px] text-muted-foreground">
                If you have portal access, a sign-in link for <b>{email}</b> is on its way. It
                signs you straight in — no password needed.
              </p>
            </div>
          ) : (
            <form onSubmit={sendCustomerLink} className="flex flex-col gap-3">
              <p className="text-[12px] text-muted-foreground">
                Enter the email address your GoCanvas team invited, and we&apos;ll send you a
                one-click sign-in link.
              </p>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cust-email">Email</Label>
                <Input
                  id="cust-email"
                  type="email"
                  required
                  placeholder="you@yourcompany.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              {error && <p className="text-[13px] text-destructive">{error}</p>}
              <Button type="submit" disabled={busy}>
                {busy ? "Sending…" : "Email me a sign-in link"}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
