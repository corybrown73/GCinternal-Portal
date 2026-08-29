import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth/callback")({
  component: AuthCallbackPage,
});

// Landing point for every emailed link: verification, magic link, OAuth,
// password recovery. supabase-js picks hash tokens up automatically; PKCE
// codes are exchanged explicitly here.
function AuthCallbackPage() {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    (async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const next = params.get("next") ?? "/";
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          setFailed(true);
          return;
        }
      } else {
        // Implicit/hash flow: give detectSessionInUrl a beat to store the session.
        await new Promise((r) => setTimeout(r, 400));
        const { data } = await supabase.auth.getSession();
        if (!data.session) {
          setFailed(true);
          return;
        }
      }
      window.location.replace(next);
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
