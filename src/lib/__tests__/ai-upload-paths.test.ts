import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeSupabase, type Rows } from "./fake-supabase";

/**
 * The data-safety edges around the documents the AI reads: an upload is
 * stored as what its bytes are, a link in the old URL column is never
 * fetched as a storage path, and a SOW the brief could not fetch is said
 * so on the brief instead of being dropped.
 */
const h = vi.hoisted(() => {
  const state = {
    supabase: { client: null as any },
    forward: null as any,
    flagModule: null as any,
    /** The automatic reading's trigger, mocked: what each upload path asked for, and when. */
    jobs: {
      autoReadDeal: vi.fn(async (_dealId: string, _trigger: string, _by?: string | null) => null),
    },
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

import { addGongReport, uploadDealContract, uploadDealSow } from "../presale.server";
import { storagePathFor } from "../sow-analysis.server";
import { sowDocument } from "../server/brief/generate";
import { MAX_DOC_BYTES } from "../server/ai/config";
import type { Account } from "../presale-types";

const enc = (s: string) => new TextEncoder().encode(s);
const bytes = (...parts: Array<number[] | string>) =>
  new Uint8Array(parts.flatMap((p) => (typeof p === "string" ? [...enc(p)] : p)));
const b64 = (u: Uint8Array) => Buffer.from(u).toString("base64");

const PDF = bytes("%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n");
const DOCX = bytes([0x50, 0x4b, 0x03, 0x04], "\0\0\0\0", "word/document.xml", "<w:document/>");
const JUNK = bytes([0x00, 0x01, 0x02, 0x03], "not a document at all");

const USER = "11111111-1111-4111-8111-111111111111";
const DEAL = "22222222-2222-4222-8222-222222222222";

const rows: Rows = {
  portal_profiles: [
    { id: USER, email: "ae@gocanvas.com", full_name: "An AE", role: "sales", created_at: "" },
  ],
  portal_accounts: [
    { id: DEAL, name: "Summit", sow_document_path: null, intake: { field_users: 12 } },
  ],
  portal_gong_reports: [],
  portal_audit_log: [],
  portal_activity: [],
};

let fake: ReturnType<typeof createFakeSupabase>;
const account = () => fake.store["portal_accounts"]![0]!;

beforeEach(() => {
  fake = createFakeSupabase(rows);
  h.supabase.client = fake.client;
  h.jobs.autoReadDeal.mockReset();
  h.jobs.autoReadDeal.mockResolvedValue(null);
});

/**
 * The automatic reading, server-side: every path that stores a source
 * queues the reading AFTER the write it depends on, with its own trigger
 * name, whoever uploaded. The flag decides inside autoReadDeal (ai-jobs
 * tests); here the binding is what is checked, because a trigger dropped
 * or moved above its write would leave every other test green.
 */
describe("the automatic reading's triggers", () => {
  it("uploadDealSow queues the reading once the new path is on the record", async () => {
    let pathSeen: string | null | undefined;
    h.jobs.autoReadDeal.mockImplementation(async () => {
      pathSeen = account().sow_document_path;
      return null;
    });
    await uploadDealSow(USER, {
      dealId: DEAL,
      fileName: "summit-sow.pdf",
      contentType: "application/pdf",
      dataBase64: b64(PDF),
    });
    expect(h.jobs.autoReadDeal).toHaveBeenCalledTimes(1);
    expect(h.jobs.autoReadDeal).toHaveBeenCalledWith(DEAL, "sow_upload", USER);
    expect(pathSeen).toBe(fake.uploads[0]!.path);
  });

  it("uploadDealContract merges the contract onto the intake, then queues the reading", async () => {
    let contractSeen: unknown;
    h.jobs.autoReadDeal.mockImplementation(async () => {
      contractSeen = account().intake.contract;
      return null;
    });
    const next = await uploadDealContract(USER, {
      dealId: DEAL,
      fileName: "contract.pdf",
      contentType: "application/pdf",
      dataBase64: b64(PDF),
    });
    expect(h.jobs.autoReadDeal).toHaveBeenCalledWith(DEAL, "contract_upload", USER);
    expect(contractSeen).toMatchObject({ path: fake.uploads[0]!.path, name: "contract.pdf" });
    // A merge of the one key, not the whole intake written back: what was
    // on the record before (or written during the upload) stands.
    expect(fake.rpcs.map((r) => r.fn)).toEqual(["portal_merge_intake"]);
    expect(Object.keys(fake.rpcs[0]!.args["p_patch"]).sort()).toEqual(["contract", "updated_at"]);
    expect(account().intake.field_users).toBe(12);
    expect(next.contract?.name).toBe("contract.pdf");
    expect(next.field_users).toBe(12);
  });

  it("addGongReport queues the reading once the notes are saved", async () => {
    let notesSeen = 0;
    h.jobs.autoReadDeal.mockImplementation(async () => {
      notesSeen = fake.store["portal_gong_reports"]!.length;
      return null;
    });
    await addGongReport(USER, {
      dealId: DEAL,
      title: "Discovery",
      reportType: "call_notes",
      contentMd: "Three crews, all paper.",
    });
    expect(h.jobs.autoReadDeal).toHaveBeenCalledWith(DEAL, "call_notes", USER);
    expect(notesSeen).toBe(1);
  });
});

describe("uploadDealSow", () => {
  it("stores a Word file labelled application/pdf as what it is", async () => {
    const r = await uploadDealSow(USER, {
      dealId: DEAL,
      fileName: "summit-sow.docx",
      contentType: "application/pdf",
      dataBase64: b64(DOCX),
    });
    expect(r.ok).toBe(true);
    expect(fake.uploads).toHaveLength(1);
    expect(fake.uploads[0]!.contentType).toMatch(/wordprocessingml/);
    expect(fake.uploads[0]!.path).toMatch(new RegExp(`^deals/${DEAL}/`));
    expect(fake.store["portal_accounts"]![0]!.sow_document_path).toBe(fake.uploads[0]!.path);
  });

  it("stores a PDF as a PDF whatever the browser said", async () => {
    await uploadDealSow(USER, {
      dealId: DEAL,
      fileName: "summit-sow.pdf",
      contentType: "application/octet-stream",
      dataBase64: b64(PDF),
    });
    expect(fake.uploads[0]!.contentType).toBe("application/pdf");
  });

  it("refuses a file that is neither, before anything is stored", async () => {
    await expect(
      uploadDealSow(USER, {
        dealId: DEAL,
        fileName: "summit-sow.pdf",
        contentType: "application/pdf",
        dataBase64: b64(JUNK),
      }),
    ).rejects.toThrow(/PDF or a Word document \(\.docx\) — this file is neither/);
    expect(fake.uploads).toHaveLength(0);
    expect(fake.store["portal_accounts"]![0]!.sow_document_path).toBeNull();
  });
});

describe("storagePathFor", () => {
  it("prefers the path column and reads the URL column only as a storage path", () => {
    expect(storagePathFor({ sow_document_path: "sow/abc-sow.pdf", sow_document_url: "x" })).toEqual(
      { path: "sow/abc-sow.pdf", link: null },
    );
    expect(storagePathFor({ sow_document_path: " ", sow_document_url: "sow/abc-sow.pdf" })).toEqual(
      { path: "sow/abc-sow.pdf", link: null },
    );
    expect(storagePathFor({ sow_document_path: null, sow_document_url: null })).toEqual({
      path: null,
      link: null,
    });
  });

  it("treats anything that looks like a link as a link, not a path", () => {
    for (const url of [
      "https://na1.docusign.net/Signing/abc",
      "www.docusign.com/abc",
      "mailto:ae@gocanvas.com",
      "docusign.com/abc",
      "drive.google.com",
    ]) {
      expect(storagePathFor({ sow_document_path: null, sow_document_url: url })).toEqual({
        path: null,
        link: url,
      });
    }
  });
});

describe("sowDocument (the brief's SOW)", () => {
  const account = (patch: Record<string, unknown>) =>
    ({ id: DEAL, name: "Summit", ...patch }) as unknown as Account;
  const admin = (
    download: () => Promise<{ data: Blob | null; error: { message: string } | null }>,
  ) => ({ storage: { from: () => ({ download }) } }) as any;

  it("is null when no SOW is on file", async () => {
    expect(
      await sowDocument(
        admin(async () => ({ data: null, error: null })),
        account({}),
      ),
    ).toBeNull();
  });

  it("reads the file it fetched", async () => {
    const d = await sowDocument(
      admin(async () => ({ data: new Blob([PDF]), error: null })),
      account({ sow_document_path: "deals/x/sow.pdf", sow_document_name: "Summit SOW.pdf" }),
    );
    expect(d?.kind).toBe("pdf");
    expect(d?.problem).toBeNull();
  });

  it("reports a download failure as a problem instead of dropping the SOW", async () => {
    const d = await sowDocument(
      admin(async () => ({ data: null, error: { message: "Object not found" } })),
      account({ sow_document_path: "deals/x/sow.pdf", sow_document_name: "Summit SOW.pdf" }),
    );
    expect(d?.kind).toBe("unsupported");
    expect(d?.block).toBeNull();
    expect(d?.problem).toMatch(/Summit SOW\.pdf could not be downloaded.*Object not found/);
    const thrown = await sowDocument(
      admin(async () => {
        throw new Error("network down");
      }),
      account({ sow_document_path: "deals/x/sow.pdf" }),
    );
    expect(thrown?.problem).toMatch(/sow\.pdf could not be opened \(network down\)/);
  });

  it("reports an oversize file with the size", async () => {
    const huge = new Uint8Array(MAX_DOC_BYTES + 1);
    huge.set(enc("%PDF-1.7"), 0);
    const d = await sowDocument(
      admin(async () => ({ data: new Blob([huge]), error: null })),
      account({ sow_document_path: "deals/x/sow.pdf" }),
    );
    expect(d?.problem).toMatch(/Export a smaller copy/);
  });
});
