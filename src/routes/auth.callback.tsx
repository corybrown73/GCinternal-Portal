import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth/callback")({
  component: AuthCallbackPage,
});

// Landing point for every emailed link: verification, magic link, OAuth,
// password recovery. supabase-js picks hash tokens up automatically; PKCE
// codes are exchanged explicitly here.
//
// THE SESSION MUST BE THE LINK'S, NOT WHOEVER WAS ALREADY SIGNED IN. An admin
// who tests a customer's reset link in their own browser has a session
// already. A fixed wait then read that session, sent them on to the
// set-password form, and the password they typed became THEIR OWN. So this
// waits until the stored session carries the very token the link brought,
// and tells the next page it arrived by a recovery link.
function AuthCallbackPage() {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    (async () => {
      const params = new URLSearchParams(window.location.search);
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const code = params.get("code");
      const next = params.get("next") ?? "/";
      const linkToken = hash.get("access_token");
      const recovery = hash.get("type") === "recovery" || next.startsWith("/forgot-password");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          setFailed(true);
          return;
        }
      } else {
        // Implicit/hash flow: detectSessionInUrl stores the session on its own
        // schedule. Poll until the stored session is the one from the URL.
        const deadline = Date.now() + 8000;
        let landed = false;
        while (Date.now() < deadline) {
          const { data } = await supabase.auth.getSession();
          if (data.session && (!linkToken || data.session.access_token === linkToken)) {
            landed = true;
            break;
          }
          await new Promise((r) => setTimeout(r, 150));
        }
        if (!landed) {
          setFailed(true);
          return;
        }
      }
      const url = new URL(next, window.location.origin);
      if (recovery) url.searchParams.set("recovery", "1");
      window.location.replace(url.pathname + url.search);
    })();
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="text-center">
        {failed ? (
          <>
            <p className="text-[13px] font-medium">This link didn&apos;t work</p>
            <p className="mt-1 text-[12px] text-muted-foreground">
              It may have expired or already been used.{" "}
              <a href="/login" className="underline underline-offset-2">
                Back to sign in
              </a>
            </p>
          </>
        ) : (
          <p className="text-[13px] text-muted-foreground">Signing you in…</p>
        )}
      </div>
    </div>
  );
}
