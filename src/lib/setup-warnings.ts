import type { SetupStatus } from "./setup-status.server";

/**
 * The things that are nobody's step but everybody's problem: an empty
 * assignment pool, AI switched off, a profile with no photo. Each one names
 * the page that fixes it. Pure, so the guide can show it and a test can
 * pin it.
 */
export type SetupWarning = { key: string; text: string; to: string; label: string };

export function setupWarnings(setup: SetupStatus | null | undefined, manager: boolean) {
  const out: SetupWarning[] = [];
  if (!setup) return out;
  if (!setup.me.photo || !setup.me.booking || !setup.me.title)
    out.push({
      key: "me",
      text: "Your profile is missing a photo, title or booking link. The welcome page shows all three.",
      to: "/settings",
      label: "Settings → My profile",
    });
  if (manager && setup.poolSize === 0)
    out.push({
      key: "pool",
      text: "Nobody is in the assignment pool, so closed-won accounts will sit unassigned.",
      to: "/admin/assignment",
      label: "Admin → Assignment",
    });
  if (manager && !setup.aiConfigured)
    out.push({
      key: "ai",
      text: "AI synthesis is off: no API key on the deployment. Briefs must be written by hand.",
      to: "/admin/integrations",
      label: "Admin → Integrations",
    });
  if (manager && !setup.emailLive)
    out.push({
      key: "email",
      text: "Email is in log mode: assignment notices and links are written to the log, not sent.",
      to: "/admin/integrations",
      label: "Admin → Integrations",
    });
  return out;
}
