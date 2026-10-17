import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { PresenterWorkspace } from "@/components/presenter-workspace";
import { WelcomePage } from "@/components/welcome-page";
import { onWelcomeChanged } from "@/lib/presenter-workspace";
import { saveIntake } from "@/lib/presale.functions";
import { getWelcome, issueWelcomeLinkFn, revokeWelcomeLinkFn } from "@/lib/welcome.functions";
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
  validateSearch: (search: Record<string, unknown>): { workspace?: true } =>
    search["workspace"] === "1" ? { workspace: true } : {},
  component: OnboardingPlanPage,
});

function OnboardingPlanPage() {
  const { dealId } = Route.useParams();
  const { workspace } = Route.useSearch();
  const qc = useQueryClient();
  const load = useServerFn(getWelcome);
  const issue = useServerFn(issueWelcomeLinkFn);
  const revoke = useServerFn(revokeWelcomeLinkFn);
  const save = useServerFn(saveIntake);

  const query = useQuery({
    queryKey: ["welcome", dealId],
    queryFn: () => load({ data: { dealId } }),
    // Live while presenting: a homework box ticked on a phone in the room
    // shows on the big screen within ten seconds.
    refetchInterval: 10_000,
    enabled: !workspace,
  });

  // The presenter's workspace, in another window of this browser, saved
  // something: re-read the plan now rather than on the next poll.
  useEffect(
    () =>
      onWelcomeChanged(dealId, () => void qc.invalidateQueries({ queryKey: ["welcome", dealId] })),
    [dealId, qc],
  );

  if (workspace) {
    return (
      <div>
        <nav className="flex items-center gap-3 border-b border-border px-6 py-2 text-[12px]">
          <Link
            to="/onboarding-plan/$dealId"
            params={{ dealId }}
            className="font-medium text-primary hover:underline"
          >
            ← Kickoff deck
          </Link>
          <span className="text-muted-foreground">Presenter workspace</span>
        </nav>
        <PresenterWorkspace dealId={dealId} />
      </div>
    );
  }

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
      workspaceHref={`/onboarding-plan/${dealId}?workspace=1`}
      onCopyLink={async () => {
        // Minting a link is not sending it. The record says "sent" only when
        // the person says so below, or when the customer opens the page.
        const { url } = await issue({ data: { dealId } });
        void qc.invalidateQueries({ queryKey: ["welcome", dealId] });
        void qc.invalidateQueries({ queryKey: ["deal", dealId] });
        return url;
      }}
      onReplaceLink={async () => {
        // A new token; the old link stops working. The new link has not been
        // sent, so "sent" is cleared until someone sends it.
        const { url } = await issue({ data: { dealId } });
        await save({ data: { dealId, patch: { welcome_shared_at: null } } as never });
        void qc.invalidateQueries({ queryKey: ["welcome", dealId] });
        void qc.invalidateQueries({ queryKey: ["deal", dealId] });
        return url;
      }}
      onRevokeLink={async () => {
        await revoke({ data: { dealId } });
        await save({ data: { dealId, patch: { welcome_shared_at: null } } as never });
        void qc.invalidateQueries({ queryKey: ["welcome", dealId] });
        void qc.invalidateQueries({ queryKey: ["deal", dealId] });
      }}
      onEditText={async (key, text) => {
        const current = query.data?.textOverrides ?? {};
        const next = { ...current };
        if (text === null) delete next[key];
        else next[key] = text;
        await save({ data: { dealId, patch: { welcome_text: next } } as never });
        await qc.invalidateQueries({ queryKey: ["welcome", dealId] });
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
