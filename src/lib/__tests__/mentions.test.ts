import { describe, expect, it } from "vitest";
import {
  EVERYONE_HANDLE,
  HANDLE_RE,
  makeHandle,
  parseMentions,
  RESERVED_HANDLES,
  segmentBody,
  type MentionParticipant,
} from "../mentions";

const P = (id: string, handle: string, display_name = handle): MentionParticipant => ({
  id,
  handle,
  display_name,
});

const dana = P("p-dana", "dana", "Dana Reyes");
const danaReyes = P("p-dana-reyes", "dana.reyes", "Dana Reyes (Ops)");
const cory = P("p-cory", "cory", "Cory Brown");
const ROOM = [dana, danaReyes, cory];

describe("parseMentions", () => {
  it("finds a plain mention", () => {
    expect(parseMentions("can you look at this @cory", ROOM).ids).toEqual(["p-cory"]);
  });

  it("does not mention anyone inside an email address", () => {
    // The failure this prevents: emailing a stranger because somebody pasted an
    // address into a message.
    const r = parseMentions("forward it to dana@acme.com please", ROOM);
    expect(r.ids).toEqual([]);
    expect(r.unknown).toEqual([]);
  });

  it("still finds a mention at the very start of the body", () => {
    expect(parseMentions("@cory ping", ROOM).ids).toEqual(["p-cory"]);
  });

  it("takes the longest matching handle", () => {
    // "@dana.reyes" is one person, not @dana followed by ".reyes".
    expect(parseMentions("hi @dana.reyes", ROOM).ids).toEqual(["p-dana-reyes"]);
  });

  it("still resolves the shorter handle when that is what was typed", () => {
    expect(parseMentions("hi @dana", ROOM).ids).toEqual(["p-dana"]);
  });

  it("ignores trailing punctuation", () => {
    for (const body of ["thanks @dana!", "@dana,", "(@dana)", "@dana.", "@dana -", "ok @dana?"]) {
      expect(parseMentions(body, ROOM).ids, body).toEqual(["p-dana"]);
    }
  });

  it("dedupes and keeps first-mention order", () => {
    const r = parseMentions("@cory and @dana and @cory again", ROOM);
    expect(r.ids).toEqual(["p-cory", "p-dana"]);
  });

  it("is case insensitive", () => {
    expect(parseMentions("@CORY @Dana", ROOM).ids).toEqual(["p-cory", "p-dana"]);
  });

  it("reports an unknown handle instead of swallowing it", () => {
    // Typing @daan and getting silence is how somebody concludes mentions are
    // broken. The composer warns using this.
    const r = parseMentions("@daan can you check", ROOM);
    expect(r.ids).toEqual([]);
    expect(r.unknown).toEqual(["daan"]);
  });

  it("dedupes unknown handles", () => {
    expect(parseMentions("@daan @daan @DAAN", ROOM).unknown).toEqual(["daan"]);
  });

  it("flags @everyone without deciding who that is", () => {
    // Deliberately NOT expanded here: who "everyone" is depends on whether the
    // message is internal or shared, and only the server knows that.
    const r = parseMentions(`@${EVERYONE_HANDLE} standup in 5`, ROOM);
    expect(r.everyone).toBe(true);
    expect(r.ids).toEqual([]);
    expect(r.unknown).toEqual([]);
  });

  it("treats every reserved alias as everyone", () => {
    for (const alias of RESERVED_HANDLES) {
      expect(parseMentions(`@${alias} hi`, ROOM).everyone, alias).toBe(true);
    }
  });

  it("finds nothing in a body with no mentions", () => {
    const r = parseMentions("shipping on Tuesday, no blockers", ROOM);
    expect(r).toEqual({ ids: [], everyone: false, unknown: [] });
  });

  it("handles a bare @ and an @ before punctuation", () => {
    expect(parseMentions("what @ ?", ROOM)).toEqual({ ids: [], everyone: false, unknown: [] });
    expect(parseMentions("cost @ $5", ROOM)).toEqual({ ids: [], everyone: false, unknown: [] });
  });

  it("finds a mention across a newline boundary", () => {
    expect(parseMentions("blocked\n@cory can you unblock", ROOM).ids).toEqual(["p-cory"]);
  });

  it("does not match an @ glued to the end of a word", () => {
    // "info@" is the start of an address even when the domain is missing.
    expect(parseMentions("mailto:info@cory", ROOM).ids).toEqual([]);
  });
});

describe("segmentBody", () => {
  const join = (body: string, room = ROOM) =>
    segmentBody(body, room)
      .map((s) => s.text)
      .join("");

  it("reproduces the body exactly", () => {
    // A renderer that drops a character changes what somebody said.
    for (const body of [
      "hi @cory",
      "@dana.reyes and @dana",
      "mail dana@acme.com then @cory",
      "@everyone standup",
      "@daan?",
      "no mentions at all",
      "@cory,@dana",
      "",
    ]) {
      expect(join(body), JSON.stringify(body)).toBe(body);
    }
  });

  it("marks a mention and leaves the punctuation in the text run", () => {
    const segs = segmentBody("thanks @dana!", ROOM);
    expect(segs).toEqual([
      { kind: "text", text: "thanks " },
      { kind: "mention", text: "@dana", participant: dana },
      { kind: "text", text: "!" },
    ]);
  });

  it("marks the longest handle", () => {
    const segs = segmentBody("@dana.reyes hi", ROOM);
    expect(segs[0]).toEqual({ kind: "mention", text: "@dana.reyes", participant: danaReyes });
  });

  it("marks an unknown handle as unknown, not as a mention", () => {
    const segs = segmentBody("@daan hi", ROOM);
    expect(segs[0]).toEqual({ kind: "unknown", text: "@daan" });
  });

  it("marks @everyone separately", () => {
    expect(segmentBody("@everyone hi", ROOM)[0]).toEqual({ kind: "everyone", text: "@everyone" });
  });

  it("leaves an email address entirely as text", () => {
    expect(segmentBody("dana@acme.com", ROOM)).toEqual([{ kind: "text", text: "dana@acme.com" }]);
  });
});

describe("makeHandle", () => {
  const shaped = (h: string) => expect(h, `"${h}" must satisfy the 0029 shape`).toMatch(HANDLE_RE);

  it("prefers the name", () => {
    const h = makeHandle("Dana Reyes", "dreyes@acme.com", []);
    expect(h).toBe("dana.reyes");
    shaped(h);
  });

  it("falls back to the email local part when there is no usable name", () => {
    const h = makeHandle("!!!", "dreyes@acme.com", []);
    expect(h).toBe("dreyes");
    shaped(h);
  });

  it("falls back again when both are unusable", () => {
    shaped(makeHandle("", "", []));
    shaped(makeHandle("...", "@acme.com", []));
  });

  it("never collides with a taken handle", () => {
    const h = makeHandle("Dana Reyes", null, ["dana.reyes"]);
    expect(h).not.toBe("dana.reyes");
    shaped(h);
  });

  it("never collides with a taken handle differing only in case", () => {
    const h = makeHandle("Dana Reyes", null, ["DANA.REYES"]);
    expect(h).not.toBe("dana.reyes");
    shaped(h);
  });

  it("never hands out a reserved handle", () => {
    for (const r of RESERVED_HANDLES) {
      const h = makeHandle(r, null, []);
      expect(RESERVED_HANDLES.has(h), `${r} -> ${h}`).toBe(false);
      shaped(h);
    }
  });

  it("stays inside the length limit even when suffixing", () => {
    const long = "Bartholomew Fitzwilliam Montgomery Wodehouse Esquire";
    const taken: string[] = [];
    for (let i = 0; i < 30; i++) {
      const h = makeHandle(long, null, taken);
      shaped(h);
      expect(taken).not.toContain(h);
      taken.push(h);
    }
  });

  it("gives 200 people in one thread 200 distinct handles", () => {
    const taken: string[] = [];
    for (let i = 0; i < 200; i++) {
      const h = makeHandle("Sam Taylor", "sam@acme.com", taken);
      shaped(h);
      expect(taken, `collision at ${i}`).not.toContain(h);
      taken.push(h);
    }
  });

  it("transliterates accents rather than dropping the letter", () => {
    expect(makeHandle("José Álvarez", null, [])).toBe("jose.alvarez");
  });

  it("pads a very short name into a legal handle", () => {
    shaped(makeHandle("Jo", null, []));
    shaped(makeHandle("X", null, []));
  });

  it("produces handles the parser can find", () => {
    // The loop that closes: a generated handle has to be a handle the parser
    // resolves, or a person is in the room and unreachable.
    const taken: string[] = [];
    for (const name of ["Dana Reyes", "José Álvarez", "Jo", "X", "!!!", "Sam Taylor"]) {
      const handle = makeHandle(name, "someone@acme.com", taken);
      taken.push(handle);
      const room = [P(`id-${handle}`, handle, name)];
      expect(parseMentions(`hi @${handle} thanks`, room).ids, handle).toEqual([`id-${handle}`]);
    }
  });
});
