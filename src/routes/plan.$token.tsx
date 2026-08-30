import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";

import { GoCanvasLogo } from "@/components/gocanvas-logo";
import { SharedPlanView } from "@/components/shared-plan-view";
import {
  commentOnPlanTask,
  completePlanTask,
  openPlan,
  postPlanMessage,
  recordPlanOpen,
  reopenPlanTask,
} from "@/lib/external-plan.functions";
import type { SharedPlan } from "@/lib/shared-plan";

/**
 * The signed-link door.
 *
 * SSR, deliberately: the loader runs on the server, verifies the token, sets
 * the `gc_plan` cookie on the response and returns either the rendered plan,
 * the passcode form, or one neutral error page. The `/view/$token` pattern
 * (verify client-side in a useEffect) is explicitly NOT the model here — one
 * round trip, no waterfall, and because the server-rendered GET records
 * nothing, the post-hydration beacon below is the only thing that can say a
 * human actually read this.
 *
 * `/plan` is in AuthGate's PUBLIC_PREFIXES; the page is noindex and sends no
 * referrer, so the token never leaks through a Referer header.
 */
export const Route = createFileRoute("/plan/$token")({
  head: () => ({
    meta: [
      { title: "Your onboarding plan — GoCanvas Onboarding Portal" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  loader: async ({ params }) => openPlan({ data: { token: params.token } }),
  component: PlanTokenPage,
});

const NEUTRAL =
  "This link isn't available. It may have expired, or been replaced by a newer one. " +
  "Ask your GoCanvas contact for a fresh link.";

function PlanTokenPage() {
  const { token } = Route.useParams();
  const initial = Route.useLoaderData();

  const [state, setState] = useState(initial);
  const [plan, setPlan] = useState<SharedPlan | null>(
    initial.state === "plan" ? initial.plan : null,
  );
  const [passcode, setPasscode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const beaconSent = useRef(false);

  // The open beacon: after hydration, once. A prefetching scanner never gets
  // here, so an 'opened' row means a browser rendered the page.
  useEffect(() => {
    if (state.state !== "plan" || beaconSent.current) return;
    beaconSent.current = true;
    void recordPlanOpen({ data: undefined }).catch(() => {});
  }, [state.state]);

  const run = async (fn: () => Promise<{ plan: SharedPlan }>) => {
    setBusy(true);
    setError(null);
    try {
      const { plan: next } = await fn();
      setPlan(next);
    } catch {
      setError("That didn't go through. Refresh your link and try again.");
    } finally {
      setBusy(false);
    }
  };

  if (state.state === "plan" && plan) {
    return (
      <div className="gc-brand gc-brand-page min-h-screen">
        <PlanBrandHeader />
        {error ? (
          <p role="alert" className="bg-destructive/10 px-4 py-2 text-center text-[12px]">
            {error}
          </p>
        ) : null}
        <SharedPlanView
          plan={plan}
          actions={{
            busy,
            onComplete: (ref) => run(() => completePlanTask({ data: { ref } })),
            onReopen: (ref) => run(() => reopenPlanTask({ data: { ref } })),
            onComment: (ref, body) => run(() => commentOnPlanTask({ data: { ref, body } })),
            onMessage: (body) => run(() => postPlanMessage({ data: { body } })),
          }}
        />
      </div>
    );
  }

  if (state.state === "passcode") {
    return (
      <Centered title="One more step">
        <p className="mt-1 text-[13px] text-muted-foreground">
          This plan is passcode protected. Enter the passcode your GoCanvas contact gave you.
        </p>
        {state.wrong ? (
          <p role="alert" className="mt-2 text-[12px] text-destructive">
            That passcode didn&apos;t match.
          </p>
        ) : null}
        <form
          className="mt-4 flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const next = await openPlan({ data: { token, passcode } });
            setState(next);
            if (next.state === "plan") setPlan(next.plan);
            setPasscode("");
            setBusy(false);
          }}
        >
          <input
            type="password"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            className="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-[13px]"
            placeholder="Passcode"
            autoFocus
          />
          <button
            type="submit"
            disabled={busy || passcode.length === 0}
            className="rounded-md border border-border px-3 py-1.5 text-[13px] disabled:opacity-40"
          >
            Open
          </button>
        </form>
      </Centered>
    );
  }

  if (state.state === "locked") {
    return (
      <Centered title="Too many attempts">
        <p className="mt-1 text-[13px] text-muted-foreground">
          This link is locked for 15 minutes. Try again after that, or ask your GoCanvas contact.
        </p>
      </Centered>
    );
  }

  return (
    <Centered title="This link isn't available">
      <p className="mt-1 text-[13px] text-muted-foreground">{NEUTRAL}</p>
    </Centered>
  );
}

function Centered({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="gc-brand gc-brand-page flex min-h-screen flex-col">
      <PlanBrandHeader />
      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="gc-card w-full max-w-md p-7 shadow-sm">
          <h1 className="gc-display text-[22px]">{title}</h1>
          {children}
        </div>
      </div>
    </div>
  );
}

/**
 * The chrome around a plan opened from a link.
 *
 * A plan link is often a customer's FIRST contact with any of this — no login,
 * no portal, just a URL in an email. Without the wordmark and the navy bar the
 * page is an unattributed checklist from an unknown sender, which is exactly
 * what a cautious person does not click into.
 */
function PlanBrandHeader() {
  return (
    <>
      <div className="gc-topbar">
        <div className="mx-auto flex h-9 w-full max-w-5xl items-center justify-end px-5 text-[11px]">
          <span className="opacity-90">p. 703-436-8069</span>
        </div>
      </div>
      <header className="border-b bg-white" style={{ borderColor: "var(--gc-line)" }}>
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center gap-3 px-5">
          <GoCanvasLogo />
          {/* A plan link is opened cold, often by somebody who was not on the
              call. The mark alone says who sent it; this says what it is. */}
          <span aria-hidden="true" style={{ color: "var(--gc-line)" }}>
            |
          </span>
          <span className="text-[14px] font-medium" style={{ color: "var(--gc-body)" }}>
            Onboarding Portal
          </span>
        </div>
      </header>
    </>
  );
}
