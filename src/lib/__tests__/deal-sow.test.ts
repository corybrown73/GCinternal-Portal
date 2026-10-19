import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeSupabase, type Rows } from "./fake-supabase";

/**
 * Every SOW upload is the deal's SOW: the deal page, the customer page's
 * "Attach SOW" and Files & links (kind SOW) all point the deal (and its live
 * project) at the newest file and queue a reading. The file it replaced
 * stays under Files & links once there is a project. And "or say why there
 * is no SOW" is saved through the intake saver.
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

import { addAccountUpload, removeAccountFile } from "../attachments.server";
import { saveDealIntake, uploadDealSow } from "../presale.server";
import { adoptUploadedSow, fileEarlierSows } from "../server/deal-sow";
import { setSowDocument, storagePathFor } from "../sow-analysis.server";
import { paperworkOnFile } from "../won-gate";

const enc = (s: string) => new TextEncoder().encode(s);
const PDF = enc("%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n");
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const b64 = (u: Uint8Array) => Buffer.from(u).toString("base64");

const USER = "11111111-1111-4111-8111-111111111111";
const DEAL = "22222222-2222-4222-8222-222222222222";
const IMPL = "33333333-3333-4333-8333-333333333333";
const LONE_IMPL = "44444444-4444-4444-8444-444444444444";
const OLD_SOW = `deals/${DEAL}/old-sow.pdf`;

const rows: Rows = {
  portal_profiles: [
    { id: USER, email: "tis@gocanvas.com", full_name: "A TIS", role: "sales", created_at: "" },
  ],
  portal_accounts: [
    {
      id: DEAL,
      name: "Sutton Farms",
      sow_document_path: null,
      sow_document_name: null,
      sow_document_url: null,
      sow_reference: null,
      intake: { has_sow: null },
    },
  ],
  implementations: [
    {
      id: IMPL,
      deal_id: DEAL,
      superseded_by_implementation_id: null,
      sow_document_path: null,
      sow_document_url: null,
      created_at: "2026-10-01T00:00:00Z",
    },
    {
      id: LONE_IMPL,
      deal_id: null,
      superseded_by_implementation_id: null,
      created_at: "2026-10-01T00:00:00Z",
    },
  ],
  account_files: [],
  portal_gong_reports: [],
  portal_audit_log: [],
  portal_activity: [],
};

let fake: ReturnType<typeof createFakeSupabase>;
let removed: string[];
const deal = () => fake.store["portal_accounts"]![0]!;
const impl = () => fake.store["implementations"]!.find((r) => r.id === IMPL)!;

beforeEach(() => {
  fake = createFakeSupabase(rows);
  // The fake's remove is a no-op; record what was removed.
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
  h.supabase.client = fake.client;
  h.jobs.autoReadDeal.mockReset();
  h.jobs.autoReadDeal.mockResolvedValue(null);
});

describe("a SOW filed under Files & links (kind SOW)", () => {
  it("becomes the deal's SOW, points the live project at it, and queues a reading", async () => {
    const out = await addAccountUpload({
      implementationId: IMPL,
      title: "Signed SOW",
      kind: "sow",
      fileName: "sutton-sow.pdf",
      contentType: "application/pdf",
      dataBase64: b64(PDF),
      actorProfileId: USER,
    });
    const path = fake.uploads[0]!.path;
    expect(out.becameDealSow).toBe(true);
    expect(deal().sow_document_path).toBe(path);
    expect(deal().sow_document_name).toBe("sutton-sow.pdf");
    expect(impl().sow_document_path).toBe(path);
    // The upload answers "Is there a SOW?" when nobody had.
    expect(deal().intake.has_sow).toBe(true);
    expect(paperworkOnFile(deal())).toBe("sow");
    expect(h.jobs.autoReadDeal).toHaveBeenCalledWith(DEAL, "sow_upload", USER);
    // The file itself stays in the list.
    expect(fake.store["account_files"]!.map((f) => f.storage_path)).toEqual([path]);
    expect(fake.store["portal_audit_log"]!.some((a) => a.action === "account.sow_uploaded")).toBe(
      true,
    );
  });

  it("is newest-wins, and the deal's older SOW stays under Files & links", async () => {
    deal().sow_document_path = OLD_SOW;
    deal().sow_document_name = "old-sow.pdf";
    await addAccountUpload({
      implementationId: IMPL,
      title: "Countersigned SOW",
      kind: "sow",
      fileName: "new-sow.pdf",
      contentType: "application/pdf",
      dataBase64: b64(PDF),
      actorProfileId: USER,
    });
    const path = fake.uploads[0]!.path;
    expect(deal().sow_document_path).toBe(path);
    const kept = fake.store["account_files"]!.find((f) => f.storage_path === OLD_SOW);
    expect(kept).toMatchObject({ implementation_id: IMPL, kind: "sow", title: "old-sow.pdf" });
    expect(removed).not.toContain(OLD_SOW);
  });

  it("removing its Files & links row keeps the file the deal still points at", async () => {
    const out = await addAccountUpload({
      implementationId: IMPL,
      title: "Signed SOW",
      kind: "sow",
      fileName: "sutton-sow.pdf",
      contentType: "application/pdf",
      dataBase64: b64(PDF),
      actorProfileId: USER,
    });
    const path = fake.uploads[0]!.path;
    await removeAccountFile({
      id: out.id,
      implementationId: IMPL,
      actor: { id: USER, role: "am" },
    });
    expect(fake.store["account_files"]).toEqual([]);
    expect(removed).not.toContain(path);
    expect(deal().sow_document_path).toBe(path);

    // A file nothing else points at is removed, as before.
    const other = await addAccountUpload({
      implementationId: IMPL,
      title: "Kickoff deck",
      kind: "deck",
      fileName: "deck.pdf",
      contentType: "application/pdf",
      dataBase64: b64(PDF),
      actorProfileId: USER,
    });
    await removeAccountFile({
      id: other.id,
      implementationId: IMPL,
      actor: { id: USER, role: "am" },
    });
    expect(removed).toContain(fake.uploads[1]!.path);
  });

  it("leaves the deal alone for another kind, or for a file that is not a PDF or Word document", async () => {
    await addAccountUpload({
      implementationId: IMPL,
      title: "Kickoff deck",
      kind: "deck",
      fileName: "deck.pdf",
      contentType: "application/pdf",
      dataBase64: b64(PDF),
      actorProfileId: USER,
    });
    const shot = await addAccountUpload({
      implementationId: IMPL,
      title: "Screenshot",
      kind: "sow",
      fileName: "shot.png",
      contentType: "image/png",
      dataBase64: b64(PNG),
      actorProfileId: USER,
    });
    expect(shot.becameDealSow).toBe(false);
    expect(deal().sow_document_path).toBeNull();
    expect(h.jobs.autoReadDeal).not.toHaveBeenCalled();
    expect(fake.store["account_files"]).toHaveLength(2);
  });
});

describe("the customer page's Attach SOW", () => {
  it("adopts the stored file as the deal's SOW and queues a reading", async () => {
    const path = "sow/abc-attached.pdf";
    fake.objects.set(`attachments/${path}`, PDF);
    const r = await adoptUploadedSow({
      implementationId: IMPL,
      path,
      name: "attached.pdf",
      actorProfileId: USER,
      source: "customer_sow_panel",
    });
    expect(r).toEqual({ adopted: true, dealId: DEAL });
    expect(deal().sow_document_path).toBe(path);
    expect(impl().sow_document_path).toBe(path);
    expect(h.jobs.autoReadDeal).toHaveBeenCalledWith(DEAL, "sow_upload", USER);
  });

  it("the Delivery record's 'Use a new file' adopts it too, and the analysis reads the new file", async () => {
    // A.pdf came in through the SOW panel; B.pdf through the analysis panel.
    fake.objects.set("attachments/sow/a-A.pdf", PDF);
    fake.objects.set("attachments/sow/b-B.pdf", PDF);
    for (const [path, name] of [
      ["sow/a-A.pdf", "A.pdf"],
      ["sow/b-B.pdf", "B.pdf"],
    ] as const) {
      // What SowAnalysisPanel sends, in order: adopt, then point the project.
      await adoptUploadedSow({
        implementationId: IMPL,
        path,
        name,
        actorProfileId: USER,
        source: "customer_sow_panel",
      });
      await setSowDocument({ implementationId: IMPL, documentUrl: path, documentName: name });
    }
    expect(deal().sow_document_path).toBe("sow/b-B.pdf");
    expect(impl()).toMatchObject({
      sow_document_path: "sow/b-B.pdf",
      sow_document_url: "sow/b-B.pdf",
      sow_document_name: "B.pdf",
    });
    expect(storagePathFor(impl()).path).toBe("sow/b-B.pdf");
    expect(h.jobs.autoReadDeal).toHaveBeenCalledTimes(2);
    // A stays under Files & links.
    expect(fake.store["account_files"]).toEqual([
      expect.objectContaining({ implementation_id: IMPL, storage_path: "sow/a-A.pdf" }),
    ]);
  });

  it("does nothing for a project with no deal", async () => {
    const path = "sow/abc-lone.pdf";
    fake.objects.set(`attachments/${path}`, PDF);
    const r = await adoptUploadedSow({
      implementationId: LONE_IMPL,
      path,
      name: "lone.pdf",
      actorProfileId: USER,
      source: "customer_sow_panel",
    });
    expect(r).toEqual({ adopted: false, reason: "no_deal" });
    expect(h.jobs.autoReadDeal).not.toHaveBeenCalled();
    // The project still reads the file its panel names.
    await setSowDocument({
      implementationId: LONE_IMPL,
      documentUrl: path,
      documentName: "lone.pdf",
    });
    const lone = fake.store["implementations"]!.find((x) => x.id === LONE_IMPL)!;
    expect(storagePathFor(lone).path).toBe(path);
    expect(lone.sow_document_path).toBe(path);
  });
});

describe("the deal page's upload", () => {
  it("sets has_sow when it is unanswered, and points the live project at the new SOW", async () => {
    await uploadDealSow(USER, {
      dealId: DEAL,
      fileName: "sow.pdf",
      contentType: "application/pdf",
      dataBase64: b64(PDF),
    });
    const path = fake.uploads[0]!.path;
    expect(deal().intake.has_sow).toBe(true);
    expect(impl().sow_document_path).toBe(path);
  });

  it("leaves an answered has_sow as it is", async () => {
    deal().intake = { has_sow: false, contract: null };
    await uploadDealSow(USER, {
      dealId: DEAL,
      fileName: "sow.pdf",
      contentType: "application/pdf",
      dataBase64: b64(PDF),
    });
    expect(deal().intake.has_sow).toBe(false);
    expect(fake.rpcs).toHaveLength(0);
  });

  it("keeps the replaced SOW under Files & links once there is a project; keeps it on the deal before", async () => {
    deal().sow_document_path = OLD_SOW;
    deal().sow_document_name = "old-sow.pdf";
    await uploadDealSow(USER, {
      dealId: DEAL,
      fileName: "sow.pdf",
      contentType: "application/pdf",
      dataBase64: b64(PDF),
    });
    expect(fake.store["account_files"]!.map((f) => f.storage_path)).toEqual([OLD_SOW]);
    expect(removed).not.toContain(OLD_SOW);

    // No project yet: the replaced object stays in the bucket and is listed
    // on the deal, and is filed under Files & links when the project starts.
    fake.store["implementations"] = [];
    fake.store["account_files"] = [];
    const before = deal().sow_document_path as string;
    await uploadDealSow(USER, {
      dealId: DEAL,
      fileName: "sow2.pdf",
      contentType: "application/pdf",
      dataBase64: b64(PDF),
    });
    expect(removed).not.toContain(before);
    expect(deal().intake.earlier_sows).toEqual([
      { path: before, name: "sow.pdf", replaced_at: expect.any(String) },
    ]);

    const filed = await fileEarlierSows({
      dealId: DEAL,
      implementationId: IMPL,
      actorProfileId: USER,
    });
    expect(filed).toBe(1);
    expect(fake.store["account_files"]).toEqual([
      expect.objectContaining({
        implementation_id: IMPL,
        kind: "sow",
        storage_path: before,
        title: "sow.pdf",
      }),
    ]);
    // Filing twice does not list it twice; the current SOW is never filed.
    expect(
      await fileEarlierSows({ dealId: DEAL, implementationId: IMPL, actorProfileId: USER }),
    ).toBe(0);
  });

  it("moves a project's stored-path SOW to the new file and keeps the old one under Files & links", async () => {
    // The customer page's Attach SOW kept its path in the url column.
    impl().sow_document_url = "sow/A.pdf";
    impl().sow_document_name = "A.pdf";
    await uploadDealSow(USER, {
      dealId: DEAL,
      fileName: "B.pdf",
      contentType: "application/pdf",
      dataBase64: b64(PDF),
    });
    const path = fake.uploads[0]!.path;
    // The name and the file the project opens agree.
    expect(impl()).toMatchObject({
      sow_document_url: path,
      sow_document_path: path,
      sow_document_name: "B.pdf",
    });
    expect(fake.store["account_files"]).toEqual([
      expect.objectContaining({
        implementation_id: IMPL,
        storage_path: "sow/A.pdf",
        title: "A.pdf",
      }),
    ]);
    expect(removed).not.toContain("sow/A.pdf");
  });

  it.each(["https://docusign.example/sow", "www.docusign.example/sow"])(
    "files a project's link to a file kept elsewhere under Files & links, then moves to the new file (%s)",
    async (link) => {
      impl().sow_document_url = link;
      impl().sow_document_name = "Signed SOW v1";
      await uploadDealSow(USER, {
        dealId: DEAL,
        fileName: "B.pdf",
        contentType: "application/pdf",
        dataBase64: b64(PDF),
      });
      const path = fake.uploads[0]!.path;
      // Newest wins, and the name and the file the project opens agree.
      expect(impl()).toMatchObject({
        sow_document_url: path,
        sow_document_name: "B.pdf",
        sow_document_path: path,
      });
      expect(fake.store["account_files"]).toEqual([
        expect.objectContaining({
          implementation_id: IMPL,
          kind: "sow",
          external_url: link,
          title: "Signed SOW v1",
        }),
      ]);
    },
  );

  it("keeps a linked SOW when the customer page's panel replaces it (adopt, then attach)", async () => {
    const link = "https://app.docusign.com/documents/details/abc";
    impl().sow_document_url = link;
    impl().sow_document_name = "Signed SOW v1";
    fake.objects.set("attachments/sow/b-B.pdf", PDF);
    // What SowAnalysisPanel sends, in order: adopt, then point the project.
    await adoptUploadedSow({
      implementationId: IMPL,
      path: "sow/b-B.pdf",
      name: "B.pdf",
      actorProfileId: USER,
      source: "customer_sow_panel",
    });
    await setSowDocument({
      implementationId: IMPL,
      documentUrl: "sow/b-B.pdf",
      documentName: "B.pdf",
    });
    expect(impl()).toMatchObject({ sow_document_url: "sow/b-B.pdf", sow_document_name: "B.pdf" });
    const linked = fake.store["account_files"]!.filter((f) => f.external_url === link);
    expect(linked).toEqual([expect.objectContaining({ kind: "sow", title: "Signed SOW v1" })]);
    // A second newer SOW does not file the same link twice.
    fake.objects.set("attachments/sow/c-C.pdf", PDF);
    impl().sow_document_url = link;
    await adoptUploadedSow({
      implementationId: IMPL,
      path: "sow/c-C.pdf",
      name: "C.pdf",
      actorProfileId: USER,
      source: "customer_sow_panel",
    });
    expect(fake.store["account_files"]!.filter((f) => f.external_url === link)).toHaveLength(1);
  });

  it("never removes a replaced SOW that Files & links still lists", async () => {
    fake.store["implementations"] = [];
    deal().sow_document_path = OLD_SOW;
    fake.store["account_files"]!.push({ id: "f1", storage_path: OLD_SOW, kind: "sow" });
    await uploadDealSow(USER, {
      dealId: DEAL,
      fileName: "sow.pdf",
      contentType: "application/pdf",
      dataBase64: b64(PDF),
    });
    expect(removed).not.toContain(OLD_SOW);
  });
});

describe("or say why there is no SOW", () => {
  it("saves no_sow_reason through the intake saver, and it counts as the paperwork", async () => {
    await saveDealIntake(USER, DEAL, { has_sow: false });
    expect(paperworkOnFile(deal())).toBeNull();
    const next = await saveDealIntake(USER, DEAL, {
      no_sow_reason: "Three seats on a standard order form",
    });
    expect(next.no_sow_reason).toBe("Three seats on a standard order form");
    expect(deal().intake.no_sow_reason).toBe("Three seats on a standard order form");
    expect(deal().intake.has_sow).toBe(false);
    expect(paperworkOnFile(deal())).toBe("no_sow");
    // Cleared, it no longer counts.
    await saveDealIntake(USER, DEAL, { no_sow_reason: null });
    expect(paperworkOnFile(deal())).toBeNull();
  });
});
