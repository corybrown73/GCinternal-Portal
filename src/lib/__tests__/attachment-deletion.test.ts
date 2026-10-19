import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeSupabase, type Rows } from "./fake-supabase";

/**
 * Issue #79. Removing an attachment is checked on the server, against the row
 * as stored: the uploader, the account, and the file's place in storage. A
 * refusal removes nothing. Viewing and uploading are covered where they are
 * used (deal-sow.test.ts); this file covers deletion.
 */

const h = vi.hoisted(() => {
  const state = {
    supabase: { client: null as any },
    forward: null as any,
    flagModule: null as any,
    jobs: {
      autoReadDeal: vi.fn(async (_dealId: string, _trigger: string, _by?: string | null) => null),
    },
    journey: { syncJourneyStage: vi.fn(async () => undefined) },
  };
  state.forward = new Proxy({}, { get: (_t, prop) => state.supabase.client?.[prop] });
  state.flagModule = {
    isFlagOn: async () => false,
    getV2Flags: async () => ({}),
    resetFlagCache: () => {},
  };
  return state;
});

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: h.forward }));
vi.mock("../../integrations/supabase/client.server", () => ({ supabaseAdmin: h.forward }));
vi.mock("@/lib/app-config.server", () => h.flagModule);
vi.mock("../app-config.server", () => h.flagModule);
vi.mock("../server/ai/jobs", () => h.jobs);
vi.mock("../journey-sync.server", () => h.journey);

import { addAccountUpload, loadAccountFiles, removeAccountFile } from "../attachments.server";
import { REMOVAL_MESSAGES } from "../attachment-permissions";

const enc = (s: string) => new TextEncoder().encode(s);
const PDF = enc("%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n");
const b64 = (u: Uint8Array) => Buffer.from(u).toString("base64");

const IMPL = "33333333-3333-4333-8333-333333333333";
const OTHER_IMPL = "55555555-5555-4555-8555-555555555555";
const UPLOADER = "11111111-1111-4111-8111-111111111111";
const COLLEAGUE = "66666666-6666-4666-8666-666666666666";
const NOBODY = "77777777-7777-4777-8777-777777777777";

const F_OWN = "a0000000-0000-4000-8000-000000000001";
const F_LINK = "a0000000-0000-4000-8000-000000000002";
const F_COLLEAGUE = "a0000000-0000-4000-8000-000000000003";
const F_NO_UPLOADER = "a0000000-0000-4000-8000-000000000004";
const F_OTHER_ACCOUNT = "a0000000-0000-4000-8000-000000000005";
const F_OUTSIDE_FOLDER = "a0000000-0000-4000-8000-000000000006";
const F_SUB_FOLDER = "a0000000-0000-4000-8000-000000000007";
const F_MISSING = "a0000000-0000-4000-8000-0000000000ff";

const U1 = "9f1c2d3e-4a5b-4c6d-8e7f-0a1b2c3d4e51";
const U2 = "9f1c2d3e-4a5b-4c6d-8e7f-0a1b2c3d4e52";
const U3 = "9f1c2d3e-4a5b-4c6d-8e7f-0a1b2c3d4e53";
const U4 = "9f1c2d3e-4a5b-4c6d-8e7f-0a1b2c3d4e54";
const U5 = "9f1c2d3e-4a5b-4c6d-8e7f-0a1b2c3d4e55";

const OWN_PATH = `accounts/${IMPL}/${U1}-deck.pdf`;

const AM = { id: UPLOADER, role: "am" };
const COLLEAGUE_SE = { id: COLLEAGUE, role: "se" };

const rows: Rows = {
  portal_accounts: [],
  implementations: [
    {
      id: IMPL,
      deal_id: null,
      customer_id: null,
      superseded_by_implementation_id: null,
      created_at: "2026-10-01T00:00:00Z",
    },
    {
      id: OTHER_IMPL,
      deal_id: null,
      customer_id: null,
      superseded_by_implementation_id: null,
      created_at: "2026-10-01T00:00:00Z",
    },
  ],
  portal_profiles: [
    { id: UPLOADER, email: "uploader@gocanvas.com", full_name: "Uploader" },
    { id: COLLEAGUE, email: "colleague@gocanvas.com", full_name: "Colleague" },
  ],
  account_files: [
    {
      id: F_OWN,
      implementation_id: IMPL,
      kind: "deck",
      title: "Kickoff deck",
      storage_path: OWN_PATH,
      external_url: null,
      added_by: UPLOADER,
      created_at: "2026-10-02T00:00:00Z",
    },
    {
      id: F_LINK,
      implementation_id: IMPL,
      kind: "board",
      title: "Board",
      storage_path: null,
      external_url: "https://miro.com/example",
      added_by: UPLOADER,
      created_at: "2026-10-02T00:00:00Z",
    },
    {
      id: F_COLLEAGUE,
      implementation_id: IMPL,
      kind: "sheet",
      title: "Colleague sheet",
      storage_path: `accounts/${IMPL}/${U2}-sheet.xlsx`,
      external_url: null,
      added_by: COLLEAGUE,
      created_at: "2026-10-02T00:00:00Z",
    },
    {
      id: F_NO_UPLOADER,
      implementation_id: IMPL,
      kind: "doc",
      title: "Old doc",
      storage_path: `accounts/${IMPL}/${U3}-old.pdf`,
      external_url: null,
      added_by: null,
      created_at: "2026-10-02T00:00:00Z",
    },
    {
      id: F_OTHER_ACCOUNT,
      implementation_id: OTHER_IMPL,
      kind: "deck",
      title: "Other account deck",
      storage_path: `accounts/${OTHER_IMPL}/${U4}-x.pdf`,
      external_url: null,
      added_by: UPLOADER,
      created_at: "2026-10-02T00:00:00Z",
    },
    {
      id: F_OUTSIDE_FOLDER,
      implementation_id: IMPL,
      kind: "deck",
      title: "Points elsewhere",
      storage_path: `accounts/${OTHER_IMPL}/${U5}-x.pdf`,
      external_url: null,
      added_by: UPLOADER,
      created_at: "2026-10-02T00:00:00Z",
    },
    {
      id: F_SUB_FOLDER,
      implementation_id: IMPL,
      kind: "deck",
      title: "In a sub-folder",
      storage_path: `accounts/${IMPL}/sub/${U1}-x.pdf`,
      external_url: null,
      added_by: UPLOADER,
      created_at: "2026-10-02T00:00:00Z",
    },
  ],
};

let fake: ReturnType<typeof createFakeSupabase>;
let removed: string[];

beforeEach(() => {
  fake = createFakeSupabase(rows);
  h.supabase.client = fake.client;
  // The fake's remove is a no-op; record what was removed from storage.
  removed = [];
  const storageFrom = fake.client.storage.from;
  fake.client.storage.from = (bucket: string) => {
    const b = storageFrom(bucket);
    return {
      ...b,
      remove: async (paths: string[]) => {
        removed.push(...paths);
        return { data: null, error: null };
      },
    };
  };
});

const fileIds = () => fake.store["account_files"]!.map((r) => r["id"]);

/** Wraps account_files so one query fails: the read, or the write. */
function wrapAccountFiles(wrap: (builder: any, orig: (t: string) => any) => any) {
  const orig = fake.client.from;
  fake.client.from = (table: string) => {
    const builder = orig(table);
    return table === "account_files" ? wrap(builder, orig) : builder;
  };
}

describe("authorised deletion", () => {
  it("lets the uploader remove their own stored file, and its object", async () => {
    const out = await removeAccountFile({ id: F_OWN, implementationId: IMPL, actor: AM });
    expect(out).toEqual({ ok: true, removed: true });
    expect(fileIds()).not.toContain(F_OWN);
    expect(removed).toEqual([OWN_PATH]);
  });

  it("lets the uploader remove their own link, which has no object to remove", async () => {
    const out = await removeAccountFile({ id: F_LINK, implementationId: IMPL, actor: AM });
    expect(out.removed).toBe(true);
    expect(fileIds()).not.toContain(F_LINK);
    expect(removed).toEqual([]);
  });

  it("removes a file its uploader filed through the upload path, and nothing else", async () => {
    const out = await addAccountUpload({
      implementationId: IMPL,
      title: "Kickoff deck",
      kind: "deck",
      fileName: "deck.pdf",
      contentType: "application/pdf",
      dataBase64: b64(PDF),
      actorProfileId: UPLOADER,
    });
    const row = fake.store["account_files"]!.find((r) => r["id"] === out.id)!;
    expect(row["added_by"]).toBe(UPLOADER);

    await removeAccountFile({ id: out.id, implementationId: IMPL, actor: AM });
    expect(fileIds()).not.toContain(out.id);
    expect(fileIds()).toContain(F_OWN);
    expect(removed).toEqual([row["storage_path"]]);
  });
});

describe("unauthorised deletion", () => {
  it("refuses another internal user, and leaves the file and its object alone", async () => {
    await expect(
      removeAccountFile({ id: F_OWN, implementationId: IMPL, actor: COLLEAGUE_SE }),
    ).rejects.toThrow(REMOVAL_MESSAGES.notUploader);
    expect(fileIds()).toContain(F_OWN);
    expect(removed).toEqual([]);
  });

  it.each([
    ["admin", "admin"],
    ["super admin", "super_admin"],
    ["manager", "manager"],
  ])(
    "refuses a %s on someone else's file, since the administrator tier is not enabled",
    async (_label, role) => {
      await expect(
        removeAccountFile({ id: F_COLLEAGUE, implementationId: IMPL, actor: { id: NOBODY, role } }),
      ).rejects.toThrow(REMOVAL_MESSAGES.notUploader);
      expect(fileIds()).toContain(F_COLLEAGUE);
      expect(removed).toEqual([]);
    },
  );

  it("refuses a customer, even on the file they uploaded", async () => {
    await expect(
      removeAccountFile({
        id: F_OWN,
        implementationId: IMPL,
        actor: { id: UPLOADER, role: "customer" },
      }),
    ).rejects.toThrow(REMOVAL_MESSAGES.notPermitted);
    expect(fileIds()).toContain(F_OWN);
    expect(removed).toEqual([]);
  });
});

describe("missing uploader information", () => {
  it("refuses everyone on a file with no recorded uploader, administrators included", async () => {
    await expect(
      removeAccountFile({
        id: F_NO_UPLOADER,
        implementationId: IMPL,
        actor: { id: NOBODY, role: "admin" },
      }),
    ).rejects.toThrow(REMOVAL_MESSAGES.noUploader);
    await expect(
      removeAccountFile({ id: F_NO_UPLOADER, implementationId: IMPL, actor: AM }),
    ).rejects.toThrow(REMOVAL_MESSAGES.noUploader);
    expect(fileIds()).toContain(F_NO_UPLOADER);
    expect(removed).toEqual([]);
  });

  it("refuses a caller whose identity is missing", async () => {
    await expect(
      removeAccountFile({ id: F_OWN, implementationId: IMPL, actor: { id: "", role: "am" } }),
    ).rejects.toThrow(REMOVAL_MESSAGES.notIdentified);
    expect(fileIds()).toContain(F_OWN);
  });
});

describe("cross-account access", () => {
  it("refuses a file from another account, even when the uploader asks", async () => {
    await expect(
      removeAccountFile({ id: F_OTHER_ACCOUNT, implementationId: IMPL, actor: AM }),
    ).rejects.toThrow(REMOVAL_MESSAGES.wrongAccount);
    expect(fileIds()).toContain(F_OTHER_ACCOUNT);
    expect(removed).toEqual([]);
  });

  it("refuses the request when the account it names is not the one the file is in", async () => {
    await expect(
      removeAccountFile({ id: F_OWN, implementationId: OTHER_IMPL, actor: AM }),
    ).rejects.toThrow(REMOVAL_MESSAGES.wrongAccount);
    expect(fileIds()).toContain(F_OWN);
    expect(removed).toEqual([]);
  });
});

describe("invalid storage paths", () => {
  it("refuses a file whose object sits in another account's folder, and removes nothing", async () => {
    await expect(
      removeAccountFile({ id: F_OUTSIDE_FOLDER, implementationId: IMPL, actor: AM }),
    ).rejects.toThrow(REMOVAL_MESSAGES.badPath);
    expect(fileIds()).toContain(F_OUTSIDE_FOLDER);
    expect(removed).toEqual([]);
  });

  it("refuses a file whose object sits in a sub-folder of the account", async () => {
    await expect(
      removeAccountFile({ id: F_SUB_FOLDER, implementationId: IMPL, actor: AM }),
    ).rejects.toThrow(REMOVAL_MESSAGES.badPath);
    expect(fileIds()).toContain(F_SUB_FOLDER);
    expect(removed).toEqual([]);
  });
});

describe("failed reads and writes never remove a file", () => {
  it("refuses when the attachment cannot be read, and removes nothing", async () => {
    wrapAccountFiles(() => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: { message: "connection reset" } }),
        }),
      }),
    }));
    await expect(
      removeAccountFile({ id: F_OWN, implementationId: IMPL, actor: AM }),
    ).rejects.toThrow(/Could not check this attachment, so nothing was removed/);
    expect(fileIds()).toContain(F_OWN);
    expect(removed).toEqual([]);
  });

  it("refuses when the uploader changes between the check and the delete, and removes nothing", async () => {
    wrapAccountFiles((builder) => {
      // Another person takes over the file after the check, before the delete runs.
      const takeOver = () => {
        const row = fake.store["account_files"]!.find((r) => r["id"] === F_OWN);
        if (row) row["added_by"] = COLLEAGUE;
      };
      return new Proxy(builder, {
        get(target, prop) {
          if (prop === "delete") {
            return () => {
              takeOver();
              return target.delete();
            };
          }
          const v = Reflect.get(target, prop, target);
          return typeof v === "function" ? v.bind(target) : v;
        },
      });
    });
    await expect(
      removeAccountFile({ id: F_OWN, implementationId: IMPL, actor: AM }),
    ).rejects.toThrow(/changed before it could be removed/);
    expect(fileIds()).toContain(F_OWN);
    expect(removed).toEqual([]);
  });

  it("refuses when the row cannot be removed, and leaves the object in place", async () => {
    wrapAccountFiles(
      (builder) =>
        new Proxy(builder, {
          get(target, prop) {
            if (prop === "delete") {
              const chain: any = {
                eq: () => chain,
                select: async () => ({ data: null, error: { message: "write refused" } }),
              };
              return () => chain;
            }
            const v = Reflect.get(target, prop, target);
            return typeof v === "function" ? v.bind(target) : v;
          },
        }),
    );
    await expect(
      removeAccountFile({ id: F_OWN, implementationId: IMPL, actor: AM }),
    ).rejects.toThrow("write refused");
    expect(removed).toEqual([]);
  });
});

describe("direct calls that bypass the page", () => {
  it("refuses a call with no actor at all, with a clear message", async () => {
    await expect(removeAccountFile({ id: F_OWN, implementationId: IMPL } as never)).rejects.toThrow(
      REMOVAL_MESSAGES.notIdentified,
    );
    expect(fileIds()).toContain(F_OWN);
    expect(removed).toEqual([]);
  });

  it("refuses an attachment that is no longer there, without removing anything", async () => {
    const out = await removeAccountFile({ id: F_MISSING, implementationId: IMPL, actor: AM });
    expect(out).toEqual({ ok: true, removed: false });
    expect(fileIds()).toHaveLength(rows["account_files"]!.length);
    expect(removed).toEqual([]);
  });
});

describe("viewing and history are preserved", () => {
  it("removing one attachment leaves every other record in place", async () => {
    await removeAccountFile({ id: F_LINK, implementationId: IMPL, actor: AM });
    expect(fileIds()).toEqual(
      rows["account_files"]!.map((r) => r["id"]).filter((id) => id !== F_LINK),
    );
  });

  it("the list shows who uploaded each file, so the card can decide whether to offer Remove", async () => {
    const files = await loadAccountFiles(IMPL);
    const own = files.find((f) => f.id === F_OWN)!;
    expect(own.added_by).toBe(UPLOADER);
    expect(own.added_by_name).toBe("Uploader");
    expect(files.find((f) => f.id === F_NO_UPLOADER)!.added_by).toBeNull();
    expect(files.find((f) => f.id === F_OTHER_ACCOUNT)).toBeUndefined();
  });
});
