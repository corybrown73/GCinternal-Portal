import type { Timeline } from "./onboarding-timeline";

/**
 * What the welcome page renders. Built on the server from the deal, the
 * intake and the plan; the same object whether the viewer is the rep in
 * the portal, the customer on their link, or the print dialog.
 */
export type WelcomeView = {
  dealId: string;
  clientName: string;
  industry: string | null;
  /** The lucide icon name for the industry. */
  icon: string;
  timeline: Timeline;
  lead: string | null;
  fieldTester: string | null;
  /** The process today, in their words. Null → a generic "paper and retyping". */
  currentProcess: string | null;
  /** "person" when a person wrote or confirmed it; "ai" when it is the brief's paraphrase. */
  currentProcessSource: "ai" | "person" | null;
  team: {
    lead: string | null;
    /** How to reach the lead. On the closing screen. */
    leadEmail: string | null;
    /** The lead's face, title and booking link, from their profile. */
    leadCard: {
      title: string | null;
      bookingUrl: string | null;
      photoUrl: string | null;
      bio: string | null;
    } | null;
    accountManager: string | null;
    solutionsEngineer: string | null;
    champion: { name: string; role: string | null } | null;
    /** Other customer-side people the notes named. On the team screen after the champion. */
    others?: Array<{ name: string; role: string | null; does?: string | null }>;
  };
  firstForm: {
    name: string;
    objective: string | null;
    source: "library" | "uploaded" | "typed" | "tbd";
  } | null;
  nextUseCases: Array<{ name: string; objective: string | null }>;
  /** Signed, short-lived. null → the icon composition. */
  photoUrl: string | null;
  /** Uploaded logos, tool key → signed URL, for the marks on the phase cards. */
  toolMarks?: Record<string, string>;
  clientLogoUrl: string | null;
  /** Homework key → ISO timestamp when the customer ticked it. */
  homeworkDone: Record<string, string>;
  /**
   * What is still blank before the page should go to a customer. Empty means
   * ready. Internal only; the customer's view carries an empty list.
   */
  readiness: Array<{ key: string; label: string; hint: string }>;
  /** Present when the viewer is internal and a link has been issued. */
  shareUrl: string | null;
  /** The link as a QR (PNG data URL), made on the server. Internal only. */
  qrDataUrl: string | null;
  sharedAt: string | null;
  openedAt: string | null;
  /** Screen keys the presenter switched off for this customer. Both modes honour it. */
  hiddenScreens: string[];
  /** Text rewritten in place on the page, by text key. Both modes read it. */
  textOverrides: Record<string, string>;
  /** New logo or existing account — the words on every screen follow it. */
  path: "new_logo" | "existing" | "dm_conversion" | "field_fusion";
  /** "Get started on your own": the help articles picked for this customer. */
  helpPicks: Array<{
    article_id: string;
    title: string;
    url: string;
    why: string;
    when: string | null;
  }>;
  /** Article id → when the customer first opened it. Internal only. */
  helpOpened: Record<string, string>;
  /** The tracked-link base for the customer's page (`/go/{token}`); null internally. */
  goBase: string | null;
  /**
   * The parking lot, as the customer sees it: what came up, when it will be
   * handled, where it stands. Dropped items are left off their page.
   */
  parkingLot?: Array<{
    request: string;
    target: string;
    status: "open" | "scheduled" | "done";
    neededForLaunch: boolean;
  }>;
};

/**
 * Screens that are OFF unless the presenter switches them on for this
 * customer: the "at a glance" phase cards and the "today → live" story. Both
 * say things the timeline and the plan already say; five screens is the deck,
 * seven is the long version. They are stored in the same hidden list as a
 * "+key" entry, so nothing about the record's shape changes.
 */
export const OPTIONAL_SCREENS: ReadonlySet<string> = new Set(["overview", "form"]);

export function isScreenShown(key: string, hidden: ReadonlyArray<string>): boolean {
  return OPTIONAL_SCREENS.has(key) ? hidden.includes(`+${key}`) : !hidden.includes(key);
}

/** The hidden list after switching one screen on or off. */
export function toggleScreen(hidden: ReadonlyArray<string>, key: string, show: boolean): string[] {
  if (OPTIONAL_SCREENS.has(key)) {
    const marker = `+${key}`;
    return show ? [...new Set([...hidden, marker])] : hidden.filter((k) => k !== marker);
  }
  return show ? hidden.filter((k) => k !== key) : [...new Set([...hidden, key])];
}

/** The homework items the customer ticks, keyed so a reworded item keeps its tick. */
export const HOMEWORK_KEYS = ["app", "user", "list"] as const;
export type HomeworkKey = (typeof HOMEWORK_KEYS)[number];
