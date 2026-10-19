import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeSupabase, type Rows } from "./fake-supabase";

/**
 * Issue #79, approved policy, checked against the database as stored. The
 * uploader may delete their attachments; the exact admin role may delete across
 * implementations, including attachments with no recorded uploader; everyone else
 * may not. A refusal changes no row and removes no object. Viewing and uploading
 * are covered here too, since they share the module.
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

import {
  accountFileLink,
  addAccountUpload,
  loadAccountFiles,
  removeAccountFile,
} from "../attachments.server";
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
const COLLEAGUE_PATH = `accounts/${IMPL}/${U2}-sheet.xlsx`;

const AM = { id: UPLOADER, role: "am" };
const ADMIN = { id: NOBODY, role: "admin" };

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
      storage_path: COLLEAGUE_PATH,
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
const filesSnapshot = () => JSON.stringify(fake.store["account_files"]);

/** A refusal: the message, every row exactly as it was, and no object removed. */
async function expectRefusedAndUnchanged(run: () => Promise<unknown>, message: string | RegExp) {
  const before = filesSnapshot();
  await expect(run()).rejects.toThrow(message);
  expect(filesSnapshot()).toBe(before);
  expect(removed).toEqual([]);
}

/** Wraps account_files so one query fails, or runs some change first. */
function wrapAccountFiles(wrap: (builder: any, orig: (t: string) => any) => any) {
  const orig = fake.client.from;
  fake.client.from = (table: string) => {
    const builder = orig(table);
    return table === "account_files" ? wrap(builder, orig) : builder;
  };
}

/** Changes a row after the check and before the delete runs. */
function changeBeforeDelete(change: () => void) {
  wrapAccountFiles(
    (builder) =>
      new Proxy(builder, {
        get(target, prop) {
          if (prop === "delete") {
            return () => {
              change();
              return target.delete();
            };
          }
          const v = Reflect.get(target, prop, target);
          return typeof v === "function" ? v.bind(target) : v;
        },
      }),
  );
}

const rowOf = (id: string) => fake.store["account_files"]!.find((r) => r["id"] === id)!;

describe("the uploader deletes their own attachment", () => {
  it("removes their stored file and its object", async () => {
    const out = await removeAccountFile({ id: F_OWN, implementationId: IMPL, actor: AM });
    expect(out).toEqual({ ok: true, removed: true });
    expect(fileIds()).not.toContain(F_OWN);
    expect(removed).toEqual([OWN_PATH]);
  });

  it("removes their own link, which has no object to remove", async () => {
    const out = await removeAccountFile({ id: F_LINK, implementationId: IMPL, actor: AM });
    expect(out.removed).toBe(true);
    expect(fileIds()).not.toContain(F_LINK);
    expect(removed).toEqual([]);
  });

  it("removes a file filed through the upload path, and nothing else", async () => {
    const out = await addAccountUpload({
      implementationId: IMPL,
      title: "Kickoff deck",
      kind: "deck",
      fileName: "deck.pdf",
      contentType: "application/pdf",
      dataBase64: b64(PDF),
      actorProfileId: UPLOADER,
    });
    const storagePath = rowOf(out.id)["storage_path"];
    expect(rowOf(out.id)["added_by"]).toBe(UPLOADER);

    await removeAccountFile({ id: out.id, implementationId: IMPL, actor: AM });
    expect(fileIds()).not.toContain(out.id);
    expect(fileIds()).toContain(F_OWN);
    expect(removed).toEqual([storagePath]);
  });
});

describe("the exact admin role deletes across implementations", () => {
  it("deletes another person's attachment, and its object", async () => {
    const out = await removeAccountFile({ id: F_COLLEAGUE, implementationId: IMPL, actor: ADMIN });
    expect(out).toEqual({ ok: true, removed: true });
    expect(fileIds()).not.toContain(F_COLLEAGUE);
    expect(removed).toEqual([COLLEAGUE_PATH]);
  });

  it("deletes an attachment with no recorded uploader", async () => {
    const out = await removeAccountFile({
      id: F_NO_UPLOADER,
      implementationId: IMPL,
      actor: ADMIN,
    });
    expect(out.removed).toBe(true);
    expect(fileIds()).not.toContain(F_NO_UPLOADER);
    expect(removed).toEqual([`accounts/${IMPL}/${U3}-old.pdf`]);
  });

  it("deletes an attachment in another implementation, when the request names that implementation", async () => {
    const out = await removeAccountFile({
      id: F_OTHER_ACCOUNT,
      implementationId: OTHER_IMPL,
      actor: ADMIN,
    });
    expect(out.removed).toBe(true);
    expect(fileIds()).not.toContain(F_OTHER_ACCOUNT);
    expect(removed).toEqual([`accounts/${OTHER_IMPL}/${U4}-x.pdf`]);
  });
});

describe("everyone else may not delete an attachment they did not upload", () => {
  it.each(["am", "se", "sales", "implementation", "tam_se", "onboarding"])(
    "refuses a %s on someone else's file",
    async (role) => {
      await expectRefusedAndUnchanged(
        () =>
          removeAccountFile({
            id: F_COLLEAGUE,
            implementationId: IMPL,
            actor: { id: NOBODY, role },
          }),
        REMOVAL_MESSAGES.notUploader,
      );
    },
  );

  it.each(["super_admin", "manager"])(
    "refuses a %s on someone else's file: only the exact admin role is an administrator",
    async (role) => {
      await expectRefusedAndUnchanged(
        () =>
          removeAccountFile({
            id: F_COLLEAGUE,
            implementationId: IMPL,
            actor: { id: NOBODY, role },
          }),
        REMOVAL_MESSAGES.notUploader,
      );
    },
  );

  it.each(["am", "manager", "super_admin"])(
    "refuses a %s on an attachment with no recorded uploader",
    async (role) => {
      await expectRefusedAndUnchanged(
        () =>
          removeAccountFile({
            id: F_NO_UPLOADER,
            implementationId: IMPL,
            actor: { id: NOBODY, role },
          }),
        REMOVAL_MESSAGES.noUploader,
      );
    },
  );

  it("refuses a customer, even on the file they uploaded", async () => {
    await expectRefusedAndUnchanged(
      () =>
        removeAccountFile({
          id: F_OWN,
          implementationId: IMPL,
          actor: { id: UPLOADER, role: "customer" },
        }),
      REMOVAL_MESSAGES.notPermitted,
    );
  });

  it("refuses a customer on an attachment with no recorded uploader", async () => {
    await expectRefusedAndUnchanged(
      () =>
        removeAccountFile({
          id: F_NO_UPLOADER,
          implementationId: IMPL,
          actor: { id: NOBODY, role: "customer" },
        }),
      REMOVAL_MESSAGES.notPermitted,
    );
  });

  it.each(["auditor", "Admin", "ADMIN", "administrator", ""])(
    "refuses an unknown role (%j), even on its own upload and on an unowned file",
    async (role) => {
      await expectRefusedAndUnchanged(
        () =>
          removeAccountFile({ id: F_OWN, implementationId: IMPL, actor: { id: UPLOADER, role } }),
        REMOVAL_MESSAGES.notPermitted,
      );
      await expectRefusedAndUnchanged(
        () =>
          removeAccountFile({
            id: F_NO_UPLOADER,
            implementationId: IMPL,
            actor: { id: NOBODY, role },
          }),
        REMOVAL_MESSAGES.notPermitted,
      );
    },
  );

  it("refuses a caller whose role is missing", async () => {
    await expectRefusedAndUnchanged(
      () =>
        removeAccountFile({
          id: F_OWN,
          implementationId: IMPL,
          actor: { id: UPLOADER, role: null },
        }),
      REMOVAL_MESSAGES.notPermitted,
    );
  });

  it("gives implementation or deal ownership no say: the account manager who did not upload is refused", async () => {
    // The deal's account manager is not an input to the rule. Owning the deal
    // does not change the answer; the uploader does.
    await expectRefusedAndUnchanged(
      () => removeAccountFile({ id: F_COLLEAGUE, implementationId: IMPL, actor: AM }),
      REMOVAL_MESSAGES.notUploader,
    );
  });
});

describe("cross-implementation deletion attempts are refused", () => {
  it("refuses an uploader whose request names another implementation", async () => {
    await expectRefusedAndUnchanged(
      () => removeAccountFile({ id: F_OWN, implementationId: OTHER_IMPL, actor: AM }),
      REMOVAL_MESSAGES.wrongAccount,
    );
  });

  it("refuses the exact admin whose request names another implementation", async () => {
    await expectRefusedAndUnchanged(
      () => removeAccountFile({ id: F_OTHER_ACCOUNT, implementationId: IMPL, actor: ADMIN }),
      REMOVAL_MESSAGES.wrongAccount,
    );
  });

  it("refuses an uploader on a file from another account", async () => {
    await expectRefusedAndUnchanged(
      () => removeAccountFile({ id: F_OTHER_ACCOUNT, implementationId: IMPL, actor: AM }),
      REMOVAL_MESSAGES.wrongAccount,
    );
  });
});

describe("invalid storage paths are refused, even for the admin", () => {
  it("refuses a file whose object sits in another account's folder", async () => {
    await expectRefusedAndUnchanged(
      () => removeAccountFile({ id: F_OUTSIDE_FOLDER, implementationId: IMPL, actor: AM }),
      REMOVAL_MESSAGES.badPath,
    );
    await expectRefusedAndUnchanged(
      () => removeAccountFile({ id: F_OUTSIDE_FOLDER, implementationId: IMPL, actor: ADMIN }),
      REMOVAL_MESSAGES.badPath,
    );
  });

  it("refuses a file whose object sits in a sub-folder of the account", async () => {
    await expectRefusedAndUnchanged(
      () => removeAccountFile({ id: F_SUB_FOLDER, implementationId: IMPL, actor: AM }),
      REMOVAL_MESSAGES.badPath,
    );
  });
});

describe("changes during deletion never remove a different file", () => {
  it("refuses when the storage path changes between the check and the delete", async () => {
    changeBeforeDelete(() => {
      rowOf(F_OWN)["storage_path"] = `accounts/${IMPL}/${U4}-swapped.pdf`;
    });
    await expect(
      removeAccountFile({ id: F_OWN, implementationId: IMPL, actor: AM }),
    ).rejects.toThrow(/changed before it could be removed/);
    expect(rowOf(F_OWN)["storage_path"]).toBe(`accounts/${IMPL}/${U4}-swapped.pdf`);
    expect(removed).toEqual([]);
  });

  it("refuses when the uploader changes between the check and the delete", async () => {
    changeBeforeDelete(() => {
      rowOf(F_OWN)["added_by"] = COLLEAGUE;
    });
    await expect(
      removeAccountFile({ id: F_OWN, implementationId: IMPL, actor: AM }),
    ).rejects.toThrow(/changed before it could be removed/);
    expect(fileIds()).toContain(F_OWN);
    expect(removed).toEqual([]);
  });

  it("refuses when the implementation changes between the check and the delete", async () => {
    changeBeforeDelete(() => {
      rowOf(F_OWN)["implementation_id"] = OTHER_IMPL;
    });
    await expect(
      removeAccountFile({ id: F_OWN, implementationId: IMPL, actor: AM }),
    ).rejects.toThrow(/changed before it could be removed/);
    expect(fileIds()).toContain(F_OWN);
    expect(removed).toEqual([]);
  });

  it("refuses an admin deletion of an unowned file once someone takes ownership of it", async () => {
    changeBeforeDelete(() => {
      rowOf(F_NO_UPLOADER)["added_by"] = UPLOADER;
    });
    await expect(
      removeAccountFile({ id: F_NO_UPLOADER, implementationId: IMPL, actor: ADMIN }),
    ).rejects.toThrow(/changed before it could be removed/);
    expect(fileIds()).toContain(F_NO_UPLOADER);
    expect(removed).toEqual([]);
  });

  it("refuses when a link becomes a stored file between the check and the delete", async () => {
    changeBeforeDelete(() => {
      rowOf(F_LINK)["storage_path"] = `accounts/${IMPL}/${U2}-x.pdf`;
      rowOf(F_LINK)["external_url"] = null;
    });
    await expect(
      removeAccountFile({ id: F_LINK, implementationId: IMPL, actor: AM }),
    ).rejects.toThrow(/changed before it could be removed/);
    expect(fileIds()).toContain(F_LINK);
    expect(removed).toEqual([]);
  });
});

describe("direct calls that bypass the page", () => {
  it("refuses a call with no actor at all, with a clear message", async () => {
    await expectRefusedAndUnchanged(
      () => removeAccountFile({ id: F_OWN, implementationId: IMPL } as never),
      REMOVAL_MESSAGES.notIdentified,
    );
  });

  it("refuses a call whose actor has no identity, even as admin", async () => {
    await expectRefusedAndUnchanged(
      () =>
        removeAccountFile({
          id: F_COLLEAGUE,
          implementationId: IMPL,
          actor: { id: "", role: "admin" },
        }),
      REMOVAL_MESSAGES.notIdentified,
    );
  });

  it("answers an attachment that is no longer there with nothing removed", async () => {
    const before = filesSnapshot();
    const out = await removeAccountFile({ id: F_MISSING, implementationId: IMPL, actor: ADMIN });
    expect(out).toEqual({ ok: true, removed: false });
    expect(filesSnapshot()).toBe(before);
    expect(removed).toEqual([]);
  });
});

describe("failed database reads and writes remove nothing", () => {
  it("refuses when the attachment cannot be read", async () => {
    wrapAccountFiles(() => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: { message: "connection reset" } }),
        }),
      }),
    }));
    await expectRefusedAndUnchanged(
      () => removeAccountFile({ id: F_OWN, implementationId: IMPL, actor: AM }),
      /Could not check this attachment, so nothing was removed/,
    );
  });

  it("refuses when the admin's read fails, even though the admin role would be allowed", async () => {
    wrapAccountFiles(() => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: { message: "statement timeout" } }),
        }),
      }),
    }));
    await expectRefusedAndUnchanged(
      () => removeAccountFile({ id: F_COLLEAGUE, implementationId: IMPL, actor: ADMIN }),
      /Could not check this attachment/,
    );
  });

  it("refuses when the row cannot be removed, and leaves the object in place", async () => {
    wrapAccountFiles(
      (builder) =>
        new Proxy(builder, {
          get(target, prop) {
            if (prop === "delete") {
              const chain: any = {
                eq: () => chain,
                is: () => chain,
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

  it("keeps the row removed when only the object's delete fails afterwards, as before", async () => {
    fake.client.storage.from = () => ({
      remove: async () => {
        throw new Error("storage unavailable");
      },
    });
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const out = await removeAccountFile({ id: F_OWN, implementationId: IMPL, actor: AM });
    expect(out).toEqual({ ok: true, removed: true });
    expect(fileIds()).not.toContain(F_OWN);
    expect(errors).toHaveBeenCalled();
    errors.mockRestore();
  });
});

describe("refusals leave the database and storage exactly as they were", () => {
  it("a run of refused attempts changes no row and removes no object", async () => {
    const before = filesSnapshot();
    const attempts = [
      () => removeAccountFile({ id: F_COLLEAGUE, implementationId: IMPL, actor: AM }),
      () => removeAccountFile({ id: F_NO_UPLOADER, implementationId: IMPL, actor: AM }),
      () =>
        removeAccountFile({
          id: F_OWN,
          implementationId: IMPL,
          actor: { id: UPLOADER, role: "customer" },
        }),
      () => removeAccountFile({ id: F_OWN, implementationId: OTHER_IMPL, actor: AM }),
      () => removeAccountFile({ id: F_OUTSIDE_FOLDER, implementationId: IMPL, actor: ADMIN }),
    ];
    for (const attempt of attempts) {
      await expect(attempt()).rejects.toThrow();
    }
    expect(filesSnapshot()).toBe(before);
    expect(removed).toEqual([]);
  });
});

describe("viewing and uploading are preserved", () => {
  it("removing one attachment leaves every other record in place", async () => {
    await removeAccountFile({ id: F_LINK, implementationId: IMPL, actor: AM });
    expect(fileIds()).toEqual(
      rows["account_files"]!.map((r) => r["id"]).filter((id) => id !== F_LINK),
    );
  });

  it("the list reports each file's uploader, so the card can decide whether to offer Remove", async () => {
    const files = await loadAccountFiles(IMPL);
    expect(files.find((f) => f.id === F_OWN)!.added_by).toBe(UPLOADER);
    expect(files.find((f) => f.id === F_OWN)!.added_by_name).toBe("Uploader");
    expect(files.find((f) => f.id === F_NO_UPLOADER)!.added_by).toBeNull();
    expect(files.find((f) => f.id === F_OTHER_ACCOUNT)).toBeUndefined();
  });

  it("opening a link still returns its address", async () => {
    await expect(accountFileLink(F_LINK)).resolves.toEqual({ url: "https://miro.com/example" });
  });

  it("an upload still records the uploader it was given", async () => {
    const out = await addAccountUpload({
      implementationId: IMPL,
      title: "Board image",
      kind: "board",
      fileName: "board.pdf",
      contentType: "application/pdf",
      dataBase64: b64(PDF),
      actorProfileId: COLLEAGUE,
    });
    expect(rowOf(out.id)["added_by"]).toBe(COLLEAGUE);
  });
});
