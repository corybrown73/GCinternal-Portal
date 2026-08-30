import { describe, expect, it } from "vitest";
import {
  audienceFor,
  recipientsFor,
  unreadCount,
  visibleTo,
  type Message,
  type Participant,
} from "../conversation";

const P = (over: Partial<Participant> & { id: string }): Participant => ({
  party_kind: "internal",
  display_name: over.id,
  handle: over.id,
  email: `${over.id}@test`,
  notify: true,
  removed_at: null,
  ...over,
});

const cory = P({ id: "cory" });
const teya = P({ id: "teya" });
const dana = P({ id: "dana", party_kind: "external" });
const raj = P({ id: "raj", party_kind: "external" });
const gone = P({ id: "gone", party_kind: "external", removed_at: "2026-01-01T00:00:00Z" });
const quiet = P({ id: "quiet", notify: false });
const ROOM = [cory, teya, dana, raj, gone, quiet];

const M = (over: Partial<Message> & { id: string; created_at: string }): Message => ({
  author_kind: "internal",
  author_name: "Cory",
  author_participant_id: "cory",
  visibility: "shared",
  body: "hi",
  edited_at: null,
  withdrawn: false,
  mention_ids: [],
  ...over,
});

describe("audienceFor", () => {
  it("an internal message reaches only the internal side", () => {
    const a = audienceFor("internal", ROOM).map((p) => p.id);
    expect(a).toEqual(["cory", "teya", "quiet"]);
    expect(a).not.toContain("dana");
  });

  it("a shared message reaches everyone still in the room", () => {
    expect(audienceFor("shared", ROOM).map((p) => p.id)).toEqual([
      "cory",
      "teya",
      "dana",
      "raj",
      "quiet",
    ]);
  });

  it("never includes a removed participant", () => {
    for (const v of ["internal", "shared"] as const) {
      expect(
        audienceFor(v, ROOM).map((p) => p.id),
        v,
      ).not.toContain("gone");
    }
  });
});

describe("recipientsFor", () => {
  const call = (over: Partial<Parameters<typeof recipientsFor>[0]> = {}) =>
    recipientsFor({
      visibility: "shared",
      authorKind: "internal",
      authorParticipantId: "cory",
      mentionIds: [],
      participants: ROOM,
      ...over,
    });

  it("never emails the author about their own message", () => {
    expect(call().map((r) => r.participant.id)).not.toContain("cory");
    expect(call({ mentionIds: ["cory"] }).map((r) => r.participant.id)).not.toContain("cory");
  });

  it("an internal note reaches nobody by default", () => {
    // A note is a note. If every internal note paged the team, the team would
    // stop reading them, and then the thread stops being one place.
    expect(call({ visibility: "internal" })).toEqual([]);
  });

  it("an internal note still reaches a colleague who was mentioned", () => {
    const r = call({ visibility: "internal", mentionIds: ["teya"] });
    expect(r.map((x) => x.participant.id)).toEqual(["teya"]);
    expect(r[0]!.reason).toBe("mentioned");
  });

  it("an internal note NEVER reaches a customer contact, even if mentioned", () => {
    // The database refuses the mention row outright (0029). This is the app-side
    // half of the same rule: even handed an impossible input, nothing addressed
    // to a contact comes out.
    const r = call({ visibility: "internal", mentionIds: ["dana", "raj"] });
    expect(r.map((x) => x.participant.id)).toEqual([]);
  });

  it("a shared message from us reaches the customer side", () => {
    expect(
      call()
        .map((r) => r.participant.id)
        .sort(),
    ).toEqual(["dana", "raj"]);
  });

  it("a message from the customer reaches the internal side", () => {
    const r = call({ authorKind: "external", authorParticipantId: "dana" });
    // cory too: they are not the author here, dana is. `quiet` is left out
    // only because they turned notifications off and were not mentioned.
    expect(r.map((x) => x.participant.id).sort()).toEqual(["cory", "teya"]);
    // Not raj: another contact on the same side is not "the other side", and
    // cc-ing the customer's colleagues on their own message is noise.
    expect(r.map((x) => x.participant.id)).not.toContain("raj");
  });

  it("a mention overrides notifications being off", () => {
    // "Quieter" is a preference. "Unreachable" is not what anyone asked for.
    expect(call().map((r) => r.participant.id)).not.toContain("quiet");
    expect(call({ mentionIds: ["quiet"] }).map((r) => r.participant.id)).toContain("quiet");
  });

  it("never reaches a removed participant", () => {
    expect(call({ mentionIds: ["gone"] }).map((r) => r.participant.id)).not.toContain("gone");
  });

  it("skips anyone with no email address", () => {
    const noEmail = P({ id: "noemail", party_kind: "external", email: null });
    const r = recipientsFor({
      visibility: "shared",
      authorKind: "internal",
      authorParticipantId: "cory",
      mentionIds: ["noemail"],
      participants: [cory, noEmail],
    });
    expect(r).toEqual([]);
  });

  it("emails a mentioned person exactly once, not once per rule", () => {
    const r = call({ mentionIds: ["dana"] });
    expect(r.filter((x) => x.participant.id === "dana")).toHaveLength(1);
    expect(r.find((x) => x.participant.id === "dana")!.reason).toBe("mentioned");
  });
});

describe("visibleTo", () => {
  const messages = [
    M({ id: "a", created_at: "2026-01-01T00:00:00Z", visibility: "shared" }),
    M({ id: "b", created_at: "2026-01-02T00:00:00Z", visibility: "internal" }),
  ];

  it("shows an internal viewer everything", () => {
    expect(visibleTo(messages, "internal").map((m) => m.id)).toEqual(["a", "b"]);
  });

  it("shows an external viewer only the shared messages", () => {
    expect(visibleTo(messages, "external").map((m) => m.id)).toEqual(["a"]);
  });
});

describe("unreadCount", () => {
  const messages = [
    M({ id: "a", created_at: "2026-01-01T00:00:00Z", author_participant_id: "teya" }),
    M({ id: "b", created_at: "2026-01-02T00:00:00Z", author_participant_id: "cory" }),
    M({ id: "c", created_at: "2026-01-03T00:00:00Z", author_participant_id: "teya" }),
  ];

  it("counts everything when the thread has never been opened", () => {
    // Never opened is not "read nothing" — somebody just added to a live thread
    // has a real backlog and the badge should say so.
    expect(unreadCount(messages, null, "cory")).toBe(2);
  });

  it("does not count the viewer's own messages", () => {
    expect(unreadCount(messages, "2026-01-01T00:00:00Z", "cory")).toBe(1);
  });

  it("counts from the cursor forward", () => {
    expect(unreadCount(messages, "2026-01-02T12:00:00Z", "cory")).toBe(1);
    expect(unreadCount(messages, "2026-01-03T00:00:00Z", "cory")).toBe(0);
  });

  it("counts everything for a viewer with no participant row", () => {
    expect(unreadCount(messages, null, null)).toBe(3);
  });
});
