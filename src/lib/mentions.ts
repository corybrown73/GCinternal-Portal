/**
 * @handles: turning what somebody typed into who they meant.
 *
 * Pure — no I/O, no database, no request. The server resolves the handles this
 * module returns into `conversation_mentions` rows; the UI renders the segments
 * it returns. Both sides go through here so a mention can never highlight in
 * the composer and then fail to notify, or notify somebody the reader never saw
 * highlighted.
 *
 * The three things that make this harder than a regex:
 *
 *  1. **Email addresses.** "send it to dana@acme.com" must not mention @acme.
 *     An `@` that follows a word character is part of an address, not a
 *     mention. This is the single most likely way to notify a stranger.
 *  2. **Longest match wins.** With both @dana and @dana.reyes in a thread,
 *     "@dana.reyes" is one person, not @dana followed by ".reyes".
 *  3. **Punctuation is not part of a name.** "thanks @dana!" and "@dana," and
 *     "(@dana)" are all @dana. A handle always ends in a letter or digit — see
 *     the shape constraint in 0029 — so any trailing '.', '-' or '_' belongs to
 *     the sentence.
 *
 * An unrecognised handle is REPORTED, never silently dropped. Typing "@daan"
 * and getting no notification and no warning is how somebody concludes the
 * feature does not work.
 */

/** Matches the `conversation_participants_handle_shape` check in 0029. */
export const HANDLE_RE = /^[a-z][a-z0-9._-]{1,38}[a-z0-9]$/;

/**
 * Mentions everyone still in the thread. Reserved: no participant may take it.
 *
 * The parser only reports that it was used. WHO "everyone" is depends on
 * whether the message is internal or shared, and that is the server's decision
 * — a pure function that guessed would be the fifth way an internal note
 * reaches a customer.
 */
export const EVERYONE_HANDLE = "everyone";

/** Handles nobody may hold, because they mean something else. */
export const RESERVED_HANDLES = new Set([EVERYONE_HANDLE, "here", "all", "channel"]);

export type MentionParticipant = {
  id: string;
  handle: string;
  display_name: string;
};

export type ParsedMentions = {
  /** Participant ids, in the order first mentioned, deduped. */
  ids: string[];
  /** `@everyone` (or an alias) appeared. The caller decides who that is. */
  everyone: boolean;
  /**
   * Handles that looked like mentions and matched nobody, without the '@'.
   * Deduped, lowercased. Surface these — do not swallow them.
   */
  unknown: string[];
};

/**
 * A candidate begins at an `@` that is not preceded by a word character (which
 * would make it an email address) and runs through the handle alphabet.
 */
const CANDIDATE_RE = /(^|[^0-9A-Za-z_])@([A-Za-z0-9._-]+)/g;

/** Handles end in a letter or digit; anything trailing belongs to the prose. */
function trimTail(token: string): string {
  return token.replace(/[^0-9a-z]+$/i, "");
}

/**
 * Longest match first: try the whole token, then drop one trailing character at
 * a time. Each attempt is re-trimmed, so "@dana.reyes." and "@dana.reyes" and
 * "@dana," all land on the right person.
 */
function resolve(
  token: string,
  byHandle: Map<string, MentionParticipant>,
): MentionParticipant | null {
  let candidate = trimTail(token);
  while (candidate.length > 0) {
    const hit = byHandle.get(candidate.toLowerCase());
    if (hit) return hit;
    candidate = trimTail(candidate.slice(0, -1));
  }
  return null;
}

function indexOf(participants: MentionParticipant[]): Map<string, MentionParticipant> {
  const m = new Map<string, MentionParticipant>();
  for (const p of participants) m.set(p.handle.toLowerCase(), p);
  return m;
}

export function parseMentions(body: string, participants: MentionParticipant[]): ParsedMentions {
  const byHandle = indexOf(participants);
  const ids: string[] = [];
  const seen = new Set<string>();
  const unknown: string[] = [];
  const unknownSeen = new Set<string>();
  let everyone = false;

  for (const match of body.matchAll(CANDIDATE_RE)) {
    const token = match[2] ?? "";
    const trimmed = trimTail(token).toLowerCase();
    if (trimmed.length === 0) continue;

    if (RESERVED_HANDLES.has(trimmed)) {
      everyone = true;
      continue;
    }

    const hit = resolve(token, byHandle);
    if (hit) {
      if (!seen.has(hit.id)) {
        seen.add(hit.id);
        ids.push(hit.id);
      }
      continue;
    }
    if (!unknownSeen.has(trimmed)) {
      unknownSeen.add(trimmed);
      unknown.push(trimmed);
    }
  }

  return { ids, everyone, unknown };
}

/* ------------------------------------------------------------------------- */
/* Rendering                                                                  */
/* ------------------------------------------------------------------------- */

export type BodySegment =
  | { kind: "text"; text: string }
  | { kind: "mention"; text: string; participant: MentionParticipant }
  | { kind: "everyone"; text: string }
  /** Looked like a mention, matched nobody. Rendered as plain text, but the
   *  composer can use this to warn before the message is sent. */
  | { kind: "unknown"; text: string };

/**
 * Split a body into renderable pieces. The concatenated `text` of every segment
 * equals the original body exactly — a renderer that drops or reorders
 * characters is a renderer that can quietly change what somebody said.
 */
export function segmentBody(body: string, participants: MentionParticipant[]): BodySegment[] {
  const byHandle = indexOf(participants);
  const out: BodySegment[] = [];
  let cursor = 0;

  const pushText = (upto: number) => {
    if (upto > cursor) out.push({ kind: "text", text: body.slice(cursor, upto) });
  };

  for (const match of body.matchAll(CANDIDATE_RE)) {
    const whole = match[0];
    const lead = match[1] ?? "";
    const token = match[2] ?? "";
    const at = (match.index ?? 0) + lead.length;

    const trimmed = trimTail(token);
    if (trimmed.length === 0) continue;

    const hit = RESERVED_HANDLES.has(trimmed.toLowerCase()) ? null : resolve(token, byHandle);
    const matchedText = hit ? trimTail(hit.handle) : trimmed;
    // Re-derive the matched span from the resolved handle's length so trailing
    // punctuation stays in the text run that follows.
    const spanEnd = at + 1 + (hit ? hit.handle.length : trimmed.length);

    pushText(at);
    if (RESERVED_HANDLES.has(trimmed.toLowerCase())) {
      out.push({ kind: "everyone", text: `@${trimmed}` });
    } else if (hit) {
      out.push({ kind: "mention", text: `@${matchedText}`, participant: hit });
    } else {
      out.push({ kind: "unknown", text: `@${trimmed}` });
    }
    cursor = spanEnd;
    void whole;
  }

  pushText(body.length);
  return out;
}

/* ------------------------------------------------------------------------- */
/* Handle generation                                                          */
/* ------------------------------------------------------------------------- */

/**
 * Build a handle for somebody joining a thread.
 *
 * Preference order is name, then the local part of the email, then a generic
 * stem — a handle a human can guess is the whole point, and "@dana" is
 * guessable in a way that "@user-7f3a" is not.
 *
 * `taken` must include handles of REMOVED participants too. Recycling a handle
 * would repoint every old "@dana" at a different person, and those messages are
 * evidence of what was said to whom.
 */
export function makeHandle(
  name: string | null | undefined,
  email: string | null | undefined,
  taken: Iterable<string>,
): string {
  const used = new Set<string>();
  for (const t of taken) used.add(t.toLowerCase());
  for (const r of RESERVED_HANDLES) used.add(r);

  const candidates = [
    slug(name ?? ""),
    slug((email ?? "").split("@")[0] ?? ""),
    // Both empty is possible: display_name is NOT NULL in the schema, but a
    // string of punctuation slugs to nothing.
    "member",
  ].filter((c) => c.length > 0);

  for (const base of candidates) {
    const fitted = fit(base);
    if (!used.has(fitted)) return fitted;
    for (let n = 2; n <= 99; n++) {
      // Trim the stem so the suffix cannot push it past the length limit.
      const suffix = String(n);
      const stem = fit(base.slice(0, Math.max(2, 40 - suffix.length)));
      const withN = fit(`${stem}${suffix}`);
      if (!used.has(withN)) return withN;
    }
  }

  // Every readable option is taken. A random tail is ugly but unambiguous, and
  // this is the branch nobody should ever see.
  for (let i = 0; i < 1000; i++) {
    const rand = fit(`member${Math.floor(Math.random() * 1e6)}`);
    if (!used.has(rand)) return rand;
  }
  throw new Error("makeHandle: could not find a free handle");
}

/** Lowercase, ASCII, handle alphabet only, runs of separators collapsed. */
function slug(raw: string): string {
  return (
    raw
      .normalize("NFKD")
      // Strip combining marks so "José" becomes "jose" rather than losing the e.
      // Escaped rather than literal: a file full of bare combining characters is
      // one careless reformat away from silently matching nothing.
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ".")
      .replace(/^[^a-z]+/, "")
      .replace(/[^a-z0-9]+$/, "")
      .replace(/\.{2,}/g, ".")
  );
}

/** Force a slug into the shape 0029 will accept. */
function fit(base: string): string {
  let s = base.replace(/^[^a-z]+/, "").replace(/[^a-z0-9]+$/, "");
  if (s.length > 40) s = s.slice(0, 40).replace(/[^a-z0-9]+$/, "");
  // The shape needs at least three characters: a letter, a middle, a letter or
  // digit. "jo" and "j" get padded rather than rejected.
  while (s.length < 3) s += "0";
  return s;
}
