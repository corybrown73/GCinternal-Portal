import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/signup")({
  component: SignupPage,
});

function SignupPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // An empty or blank env value must never disable signups — fall back to
    // the default domain. The database trigger is the authoritative check.
    const configured = (import.meta.env["VITE_ALLOWED_EMAIL_DOMAINS"] ?? "")
      .split(",")
      .map((d: string) => d.trim().toLowerCase())
      .filter(Boolean);
    const allowed = configured.length > 0 ? configured : ["gocanvas.com"];
    const domain = email.split("@")[1]?.toLowerCase();
    if (!domain || !allowed.includes(domain)) {
      setError(`Signups are limited to ${allowed.map((d: string) => "@" + d).join(", ")} addresses. Customers are invited by their GoCanvas team instead.`);
      return;
    }
    if (password.length < 12) {
      setError("Password must be at least 12 characters.");
      return;
    }

    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    setBusy(false);
    if (error) {
      setError(
        error.message.includes("restricted")
          ? "Signups are restricted to approved email domains."
          : error.message
      );
      return;
    }
    setSent(true);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="text-lg font-semibold tracking-tight">GoCanvas Handoff Hub</div>
          <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Create your team account
          </p>
        </div>
        <div className="rounded-md border border-border bg-card p-5">
          {sent ? (
            <div className="py-3 text-center">
              <p className="text-[13px] font-medium">Check your inbox</p>
              <p className="mt-1 text-[12px] text-muted-foreground">
                We sent a verification link to <b>{email}</b>. Click it, then sign in.
              </p>
              <Link
                to="/login"
                className="mt-3 inline-block text-[12px] text-foreground underline-offset-2 hover:underline"
              >
                Back to sign in
              </Link>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="name">Full name</Label>
                <Input id="name" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="email">Work email</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  placeholder="you@gocanvas.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="password">
                  Password <span className="font-normal text-muted-foreground">(12+ characters)</span>
                </Label>
                <Input
                  id="password"
                  type="password"
                  required
                  minLength={12}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              {error && <p className="text-[13px] text-destructive">{error}</p>}
              <Button type="submit" disabled={busy} className="mt-1">
                {busy ? "Creating…" : "Create account"}
              </Button>
              <p className="text-center text-[12px] text-muted-foreground">
                Already have an account?{" "}
                <Link to="/login" className="text-foreground underline-offset-2 hover:underline">
                  Sign in
                </Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
