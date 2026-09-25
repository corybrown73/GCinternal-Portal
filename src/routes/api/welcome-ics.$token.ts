import { createFileRoute } from "@tanstack/react-router";

/**
 * GET /api/welcome-ics/{token}?event={key}
 *
 * The customer's plan as a calendar file: one event, or all of them. A
 * server route because a page route cannot answer text/calendar, and a
 * phone opens a .ics link straight into its calendar app. Authorisation is
 * the welcome page's own: the token resolves or it does not, and a bad one
 * gets the same neutral 404 as a bad page link.
 */
async function handle(params: unknown, request: Request): Promise<Response> {
  const { token } = params as { token: string };
  try {
    return await serve(token, request);
  } catch (e) {
    // A customer's calendar link must never show the app's error page: say
    // what failed in one line, and log it where the next person can find it.
    console.error("[welcome-ics]", token.slice(0, 12), e);
    return new Response("The calendar file could not be made. Please try again later.", {
      status: 500,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
  }
}

async function serve(token: string, request: Request): Promise<Response> {
  const { openWelcome } = await import("@/lib/welcome.server");
  const view = await openWelcome(token);
  if (!view) return new Response("Not found", { status: 404 });

  const only = new URL(request.url).searchParams.get("event");
  const { appUrl } = await import("@/lib/app-url");
  const { planEvents } = await import("@/lib/welcome-events");
  const { buildIcs } = await import("@/lib/ics");
  const events = planEvents({
    timeline: view.timeline,
    clientName: view.clientName,
    url: `${appUrl()}/welcome/${token}`,
    only,
  });
  if (events.length === 0) return new Response("Not found", { status: 404 });
  const body = buildIcs(events, `GoCanvas onboarding — ${view.clientName}`);
  const name = `${view.clientName} — ${only ? events[0]!.summary : "onboarding plan"}.ics`.replace(
    /[\\/:*?"<>|]/g,
    "-",
  );
  return new Response(body, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": `attachment; filename="${name}"`,
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}

export const Route = createFileRoute("/api/welcome-ics/$token")({
  server: {
    handlers: {
      GET: ({ params, request }: { params: unknown; request: Request }) => handle(params, request),
    },
  },
});
