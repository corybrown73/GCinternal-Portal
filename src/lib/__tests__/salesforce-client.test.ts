import { describe, expect, it, vi } from "vitest";

import {
  createSalesforceClient,
  SalesforceAuthError,
  SalesforceQueryError,
  stripAttributes,
} from "../server/salesforce-client";

const env = {
  clientId: "key",
  clientSecret: "secret",
  loginUrl: "https://gocanvas.my.salesforce.com",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("the Salesforce client", () => {
  it("exchanges the key and secret for a token, then queries with it, following pages", async () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      calls.push({ url: u, init });
      if (u.endsWith("/services/oauth2/token")) {
        return json({ access_token: "tok", instance_url: "https://gocanvas.my.salesforce.com/" });
      }
      if (u.includes("/query?q=")) {
        return json({
          done: false,
          nextRecordsUrl: "/services/data/v62.0/query/01g-2000",
          records: [
            {
              attributes: { type: "Opportunity" },
              Id: "1",
              Account: { attributes: {}, Name: "A" },
            },
          ],
        });
      }
      if (u.endsWith("/query/01g-2000")) {
        return json({ done: true, records: [{ attributes: {}, Id: "2" }] });
      }
      return new Response("nope", { status: 404 });
    });
    const client = createSalesforceClient(env, fetchImpl as unknown as typeof fetch);
    const rows = await client.query("SELECT Id FROM Opportunity");
    expect(rows).toEqual([{ Id: "1", Account: { Name: "A" } }, { Id: "2" }]);

    const tokenCall = calls[0]!;
    expect(String(tokenCall.init?.body)).toContain("grant_type=client_credentials");
    expect(String(tokenCall.init?.body)).toContain("client_id=key");
    expect((calls[1]!.init?.headers as Record<string, string>)["authorization"]).toBe("Bearer tok");
    // One token for both pages.
    expect(calls.filter((c) => c.url.endsWith("/token"))).toHaveLength(1);
  });

  it("gets a fresh token once on a 401, and gives up after that", async () => {
    let tokens = 0;
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      if (u.endsWith("/token")) {
        tokens += 1;
        return json({ access_token: `tok${tokens}`, instance_url: "https://x.my.salesforce.com" });
      }
      return tokens < 2
        ? json([{ errorCode: "INVALID_SESSION_ID", message: "Session expired" }], 401)
        : json({ done: true, records: [{ Id: "ok" }] });
    });
    const client = createSalesforceClient(env, fetchImpl as unknown as typeof fetch);
    expect(await client.query("SELECT Id FROM Opportunity")).toEqual([{ Id: "ok" }]);
    expect(tokens).toBe(2);
  });

  it("names Salesforce's error code when a query is refused", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      if (u.endsWith("/token"))
        return json({ access_token: "t", instance_url: "https://x.my.salesforce.com" });
      return json(
        [
          {
            errorCode: "INVALID_FIELD",
            message: "No such column 'Nope__c' on entity 'Opportunity'",
          },
        ],
        400,
      );
    });
    const client = createSalesforceClient(env, fetchImpl as unknown as typeof fetch);
    const err = await client.query("SELECT Nope__c FROM Opportunity").catch((e) => e);
    expect(err).toBeInstanceOf(SalesforceQueryError);
    expect((err as SalesforceQueryError).errorCode).toBe("INVALID_FIELD");
    expect((err as Error).message).toMatch(/Nope__c/);
  });

  it("explains a refused token in the admin's terms", async () => {
    const fetchImpl = vi.fn(async () =>
      json(
        { error: "invalid_client", error_description: "client credentials flow not enabled" },
        400,
      ),
    );
    const client = createSalesforceClient(env, fetchImpl as unknown as typeof fetch);
    const err = await client.whoAmI().catch((e) => e);
    expect(err).toBeInstanceOf(SalesforceAuthError);
    expect((err as Error).message).toMatch(/Client Credentials Flow/);
    expect((err as Error).message).toMatch(/invalid_client/);
  });

  it("strips the attributes noise at every level", () => {
    expect(
      stripAttributes({
        attributes: { type: "X" },
        a: 1,
        b: { attributes: {}, c: [{ attributes: {}, d: 2 }] },
      }),
    ).toEqual({ a: 1, b: { c: [{ d: 2 }] } });
  });
});
