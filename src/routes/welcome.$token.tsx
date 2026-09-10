import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { WelcomePage } from "@/components/welcome-page";
import { openWelcome, tickWelcomeHomework } from "@/lib/welcome.functions";
import type { WelcomeView } from "@/lib/welcome";

/**
 * The customer's link. Server-rendered from the token in one round trip;
 * a bad token gets one neutral message. `/welcome` is public in AuthGate,
 * noindex, and sends no referrer so the token never leaks through a header.
 */
export const Route = createFileRoute("/welcome/$token")({
  head: () => ({
    meta: [
      { title: "Your onboarding plan — GoCanvas" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "referrer", content: "no-referrer" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap",
      },
    ],
  }),
  loader: async ({ params }) => openWelcome({ data: { token: params.token } }),
  component: WelcomeTokenPage,
});

function WelcomeTokenPage() {
  const { token } = Route.useParams();
  const initial = Route.useLoaderData();
  const tick = useServerFn(tickWelcomeHomework);
  const open = useServerFn(openWelcome);
  const [view, setView] = useState<WelcomeView | null>(initial);

  // Live: the page follows the plan. A date moved in the portal, or a step
  // ticked done, shows here within ten seconds — while the customer is
  // looking at it. Polling, not sockets: one small read, no infrastructure.
  const live = useQuery({
    queryKey: ["welcome-live", token],
    queryFn: () => open({ data: { token } }),
    enabled: Boolean(initial),
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
  });
  useEffect(() => {
    if (live.data) setView(live.data);
  }, [live.data]);

  if (!view) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-md text-center">
          <img
            src="/branding/gocanvas-wordmark-navy.png"
            alt="GoCanvas"
            className="mx-auto h-7 w-auto"
          />
          <h1 className="mt-6 text-xl font-semibold tracking-tight">
            This link isn&apos;t available
          </h1>
          <p className="mt-2 text-[13px] text-muted-foreground">
            It may have been replaced by a newer one. Ask your GoCanvas contact for a fresh link.
          </p>
        </div>
      </div>
    );
  }

  return (
    <WelcomePage
      view={view}
      mode="shared"
      icsBase={`/api/welcome-ics/${token}`}
      onTick={async (key, done) => {
        const { homeworkDone } = await tick({ data: { token, key, done } });
        setView((v) => (v ? { ...v, homeworkDone } : v));
      }}
    />
  );
}
