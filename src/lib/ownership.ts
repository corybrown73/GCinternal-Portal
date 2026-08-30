/**
 * Whose accounts am I looking at?
 *
 * WHAT THIS IS, SAID PLAINLY. This is a DEFAULT VIEW, not an access control.
 * Teya opens the hub and sees her own accounts because that is the useful
 * default — not because she is forbidden from seeing anyone else's. She can
 * switch to a colleague's book, or to everything, in one click, and nothing
 * stops her.
 *
 * That is deliberate and it is what the product needs: covering for somebody
 * who is on leave is a Tuesday, not an exception, and a permission model that
 * makes covering an act of administration is a permission model people route
 * around. Real row-level restriction — where the rows do not exist for her at
 * all — is a different and much larger change, it would break covering, and it
 * is not what this module does. If it is ever wanted, it belongs in the
 * database (triggers and policies), not here.
 *
 * What this DOES buy: a first screen that is about her work, an honest label
 * saying whose book is on screen, and a URL that can be sent to somebody else
 * and shows them the same thing.
 */

export type ScopeMode =
  /** The signed-in person's own book. The default everywhere. */
  | "mine"
  /** Every account. Explicitly chosen, and the header says so. */
  | "all"
  /** Somebody else's book — covering, or a manager looking at their team. */
  | "person";

export type OwnerScope = {
  mode: ScopeMode;
  /** Set only when mode is "person". A team_members id. */
  personId: string | null;
};

export const DEFAULT_SCOPE: OwnerScope = { mode: "mine", personId: null };

/**
 * Who "mine" is. A person has two ids because the schema has two owner
 * vocabularies: delivery ownership points at `team_members`, and the pre-sale
 * account owners point at `portal_profiles`. Both are the same human.
 */
export type Viewer = {
  profileId: string;
  teamMemberId: string | null;
  name: string;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Read a scope out of a URL parameter.
 *
 * Anything unrecognised falls back to "mine" rather than to "all". A typo in a
 * link should show somebody less than they expected, never more — and "mine" is
 * the state they can always reason about.
 */
export function parseScope(raw: string | null | undefined): OwnerScope {
  if (!raw) return DEFAULT_SCOPE;
  // Note for callers deciding a DEFAULT: this function cannot tell you whether
  // the user asked for "mine" or asked for nothing — both arrive as MINE. Use
  // `scopeWasSpecified` first when that difference matters, which it does
  // whenever you are choosing what an unscoped visit should show.
  const value = raw.trim().toLowerCase();
  if (value === "all") return { mode: "all", personId: null };
  if (value === "mine") return DEFAULT_SCOPE;
  if (value.startsWith("owner:")) {
    const id = raw.trim().slice("owner:".length);
    return UUID_RE.test(id) ? { mode: "person", personId: id } : DEFAULT_SCOPE;
  }
  return DEFAULT_SCOPE;
}

/** The inverse. `null` for the default, so the parameter stays off clean URLs. */
export function scopeParam(scope: OwnerScope): string | null {
  if (scope.mode === "mine") return null;
  if (scope.mode === "all") return "all";
  return scope.personId ? `owner:${scope.personId}` : null;
}

/**
 * The ownership facts about one project, gathered from the four places the
 * schema keeps them.
 *
 * All four count. An SE who sold the deal and a CSM who inherited the account
 * both have a real claim to "my accounts", and a definition that recognised
 * only the implementation lead would give half the team an empty dashboard.
 */
export type OwnershipFacts = {
  /** implementations.owner_id — the delivery lead. team_members. */
  implementationOwnerId: string | null;
  /** customers.csm_owner_id. team_members. */
  csmOwnerId: string | null;
  /** portal_accounts.am_owner_id. portal_profiles. */
  amOwnerProfileId: string | null;
  /** portal_accounts.se_owner_id. portal_profiles. */
  seOwnerProfileId: string | null;
};

export function isOwnedBy(facts: OwnershipFacts, viewer: Viewer): boolean {
  const byTeamMember =
    viewer.teamMemberId !== null &&
    (facts.implementationOwnerId === viewer.teamMemberId ||
      facts.csmOwnerId === viewer.teamMemberId);
  const byProfile =
    facts.amOwnerProfileId === viewer.profileId || facts.seOwnerProfileId === viewer.profileId;
  return byTeamMember || byProfile;
}

/**
 * "Somebody else's book" is resolved against team_members only.
 *
 * The picker lists team members, and a team member id is what a shared link
 * carries. Mapping it back to a profile to also match am/se ownership would
 * need a lookup this pure module has no business doing; the server does it and
 * passes a fully-populated Viewer.
 */
export function matchesScope(
  facts: OwnershipFacts,
  scope: OwnerScope,
  viewer: Viewer,
  personViewer?: Viewer | null,
): boolean {
  if (scope.mode === "all") return true;
  if (scope.mode === "mine") return isOwnedBy(facts, viewer);
  if (!scope.personId) return isOwnedBy(facts, viewer);
  // A resolved Viewer for that person matches on all four fields, exactly as
  // "mine" does. Without one, fall back to the two team_member fields — a
  // narrower answer, never a wider one.
  if (personViewer) return isOwnedBy(facts, personViewer);
  return facts.implementationOwnerId === scope.personId || facts.csmOwnerId === scope.personId;
}

/**
 * What the header says. Never silent: a filtered list that does not say it is
 * filtered is how somebody concludes an account was deleted.
 */
export function describeScope(
  scope: OwnerScope,
  viewer: Viewer,
  personName?: string | null,
): string {
  if (scope.mode === "all") return "All accounts";
  if (scope.mode === "mine") return `${viewer.name}'s accounts`;
  return personName ? `${personName}'s accounts` : "One owner's accounts";
}

/** True when the view is showing somebody something other than their own book. */
export function isCovering(scope: OwnerScope): boolean {
  return scope.mode === "person";
}

/**
 * Did the request actually name a scope?
 *
 * `parseScope` folds "absent" and "mine" into the same answer, which is right
 * for reading a URL and wrong for choosing a default. An explicit `?scope=mine`
 * means "show me my book even if it is empty" — somebody checking that they
 * have nothing assigned needs to be able to see exactly that. An absent scope
 * means nobody has expressed a preference, and the app should pick well.
 */
export function scopeWasSpecified(raw: string | null | undefined): boolean {
  return typeof raw === "string" && raw.trim() !== "";
}

/**
 * What an unscoped visit should show.
 *
 * THE BUG THIS FIXES. The default was always "mine", and the only account with
 * a login owns nothing — so Home, /customers and /pipeline all opened reading
 * zero against nine live implementations. An app whose front page says "0 act
 * now" when there are nine projects in flight is not filtering, it is lying,
 * and the reader has no way to tell which.
 *
 * Two cases get "all":
 *
 *   * the viewer owns nothing. "Mine" is then an empty page by construction,
 *     and an empty page as a first impression teaches people the tool is
 *     broken. Showing everything is both more useful and more honest.
 *   * the viewer is an admin. Admins are here to see across the team; their own
 *     book is the unusual view for them, not the default one.
 *
 * Everyone else still lands on their own accounts, which is the whole point of
 * the feature for the people it was built for.
 */
export function defaultScopeFor(input: { ownsAnything: boolean; isAdmin: boolean }): OwnerScope {
  if (input.isAdmin || !input.ownsAnything) return { mode: "all", personId: null };
  return DEFAULT_SCOPE;
}
