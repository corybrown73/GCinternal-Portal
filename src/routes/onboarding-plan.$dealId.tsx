import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { WelcomePage } from "@/components/welcome-page";
import { saveIntake } from "@/lib/presale.functions";
import { getWelcome, issueWelcomeLinkFn } from "@/lib/welcome.functions";
import { toggleScreen } from "@/lib/welcome";

/**
 * The internal view of a deal's welcome page: preview, present, print, and
 * the button that mints the customer's link. Same component as the page
 * the customer sees, with the toolbar on.
 */
export const Route = createFileRoute("/onboarding-plan/$dealId")({
  head: () => ({
    meta: [{ title: "Onboarding plan — GoCanvas Handoff Hub" }],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap",
      },
    ],
  }),
  component: OnboardingPlanPage,
});

function OnboardingPlanPage() {
  const { dealId } = Route.useParams();
  const qc = useQueryClient();
  const load = useServerFn(getWelcome);
  const issue = useServerFn(issueWelcomeLinkFn);
  const save = useServerFn(saveIntake);

  const query = useQuery({
    queryKey: ["welcome", dealId],
    queryFn: () => load({ data: { dealId } }),
    // Live while presenting: a homework box ticked on a phone in the room
    // shows on the big screen within ten seconds.
    refetchInterval: 10_000,
  });

  if (query.isPending) {
    return <p className="p-6 text-[13px] text-muted-foreground">Loading the plan…</p>;
  }
  if (!query.data) {
    return (
      <div className="p-6 text-[13px]">
        <p>No such deal.</p>
        <Link to="/pipeline" className="underline">
          Back to the pipeline
        </Link>
      </div>
    );
  }

  return (
    <WelcomePage
      view={query.data}
      mode="internal"
      backHref={`/deals/${dealId}`}
      notesHref={`/onboarding-notes/${dealId}`}
      onCopyLink={async () => {
        // Minting a link is not sending it. The record says "sent" only when
        // the person says so below, or when the customer opens the page.
        const { url } = await issue({ data: { dealId } });
        void qc.invalidateQueries({ queryKey: ["welcome", dealId] });
        void qc.invalidateQueries({ queryKey: ["deal", dealId] });
        return url;
      }}
      onMarkSent={async () => {
        await save({
          data: { dealId, patch: { welcome_shared_at: new Date().toISOString() } } as never,
        });
        void qc.invalidateQueries({ queryKey: ["welcome", dealId] });
        void qc.invalidateQueries({ queryKey: ["deal", dealId] });
      }}
      onToggleScreen={async (key, hide) => {
        const current = query.data?.hiddenScreens ?? [];
        const next = toggleScreen(current, key, !hide);
        await save({ data: { dealId, patch: { welcome_hidden_screens: next } } as never });
        await qc.invalidateQueries({ queryKey: ["welcome", dealId] });
      }}
    />
  );
}
