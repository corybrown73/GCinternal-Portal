import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GoCanvasLogo } from "@/components/gocanvas-logo";
import { Check } from "lucide-react";

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
          : "That email and password combination didn't work.",
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
    // The brand palette is scoped to this wrapper. The internal app keeps its
    // dense greys; this page is the first thing anybody sees and belongs to the
    // marketing brand, not to the working tool behind it.
    <div className="gc-brand gc-brand-page min-h-screen">
      <header className="gc-topbar">
        <div className="mx-auto flex h-11 w-full max-w-6xl items-center justify-end gap-6 px-5 text-[12px]">
          <span className="opacity-90">p. 703-436-8069</span>
          <span className="opacity-90">Help Center</span>
        </div>
      </header>

      <div className="mx-auto w-full max-w-6xl px-5">
        <div className="flex h-16 items-center">
          <GoCanvasLogo />
        </div>

        <div className="grid items-center gap-10 py-10 lg:grid-cols-2 lg:gap-16 lg:py-16">
          {/* A sign-in page that is only a form tells a cold arrival nothing
              about where they have landed. This half says what the page is, in
              the brand's own voice and at its own scale — and stops there.

              NOT a pitch. Nobody reaches this page to be sold anything: it is
              GoCanvas staff signing in to work, and customers who were already
              invited by their onboarding team and are following a link. The
              customer has bought the product; selling it back to them mid-
              rollout is noise at best, and at worst makes them wonder whether
              they have landed somewhere they should not be. So: three
              statements of fact, no value proposition, no call to action. */}
          <div className="hidden lg:block">
            <p
              className="text-[12px] font-semibold uppercase tracking-[0.14em]"
              style={{ color: "var(--gc-body)" }}
            >
              GoCanvas
            </p>
            <h1 className="gc-display mt-4 text-[54px]">
              Onboarding
              <br />
              <span style={{ color: "var(--gc-blue)" }}>Portal</span>
            </h1>
            <p className="gc-lede mt-6 max-w-md text-[16px]">
              Where GoCanvas customers and their onboarding team follow the same rollout plan — from
              kickoff through to go-live.
            </p>
            <div className="gc-panel mt-10 p-6">
              <p
                className="text-[11px] font-semibold uppercase tracking-[0.12em]"
                style={{ color: "var(--gc-body)" }}
              >
                What you&apos;ll find here
              </p>
              <ul className="mt-3 space-y-3 text-[14px]" style={{ color: "var(--gc-ink)" }}>
                {[
                  "Your rollout plan and the dates on it",
                  "What happens next, and what we need from you",
                  "Who your onboarding team is and how to reach them",
                ].map((line) => (
                  <li key={line} className="flex items-start gap-2.5">
                    <Check
                      className="mt-0.5 h-4 w-4 shrink-0"
                      style={{ color: "var(--gc-blue)" }}
                    />
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mx-auto w-full max-w-md">
            <h2 className="gc-display text-[28px] lg:hidden">Sign in</h2>
            <div className="gc-card mt-4 p-6 shadow-sm lg:mt-0">
              <div
                className="mb-5 grid grid-cols-2 gap-1 rounded-full p-1"
                style={{ backgroundColor: "var(--gc-blue-soft)" }}
              >
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
                    className="rounded-full px-3 py-1.5 text-[13px] font-semibold transition-colors"
                    style={
                      mode === m
                        ? {
                            backgroundColor: "#ffffff",
                            color: "var(--gc-ink)",
                            boxShadow: "0 1px 3px rgb(0 0 0 / .10)",
                          }
                        : { color: "var(--gc-body)" }
                    }
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
                  <button
                    type="submit"
                    disabled={busy}
                    className="gc-btn gc-btn-primary mt-1 h-11 px-5 text-[14px]"
                  >
                    {busy ? "Signing in…" : "Sign in"}
                  </button>
                  {microsoftEnabled && (
                    <button
                      type="button"
                      className="gc-btn h-11 px-5 text-[14px]"
                      style={{ border: "1px solid var(--gc-line)", color: "var(--gc-ink)" }}
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
                    </button>
                  )}
                  <p className="text-center text-[12px] text-muted-foreground">
                    New here?{" "}
                    <Link
                      to="/signup"
                      className="text-foreground underline-offset-2 hover:underline"
                    >
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
                    Enter the email your GoCanvas team invited and we&apos;ll send a sign-in link —
                    no password to remember. You&apos;ll land on your own onboarding plan.
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
                  <button
                    type="submit"
                    disabled={busy}
                    className="gc-btn gc-btn-cta h-11 px-5 text-[14px]"
                  >
                    {busy ? "Sending…" : "Email me a sign-in link"}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
