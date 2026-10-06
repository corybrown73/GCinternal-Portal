import { sfId18 } from "./sf-id";

/**
 * The Hub's own door into Salesforce: a Connected App's Consumer Key and
 * Secret, exchanged for a token with the OAuth 2.0 client-credentials flow
 * (no person logs in; the app's "Run As" user is who Salesforce sees), then
 * SOQL over the REST API.
 *
 * Three environment variables, set on the Vercel project and nowhere else:
 *   SALESFORCE_CLIENT_ID      the Consumer Key
 *   SALESFORCE_CLIENT_SECRET  the Consumer Secret
 *   SALESFORCE_LOGIN_URL      the org's My Domain, https://<org>.my.salesforce.com
 *
 * `fetch` is injected so the client is tested without a network. Nothing
 * here knows about deals: it returns Salesforce's records as plain objects,
 * with the `attributes` noise removed, and the poll (salesforce-poll.ts)
 * decides what they mean.
 */

export const SALESFORCE_API_VERSION = "v62.0";

export type SalesforceEnv = {
  clientId: string;
  clientSecret: string;
  loginUrl: string;
};

export function salesforceEnv(): SalesforceEnv | null {
  const clientId = process.env["SALESFORCE_CLIENT_ID"]?.trim();
  const clientSecret = process.env["SALESFORCE_CLIENT_SECRET"]?.trim();
  const loginUrl = process.env["SALESFORCE_LOGIN_URL"]?.trim().replace(/\/+$/, "");
  if (!clientId || !clientSecret || !loginUrl) return null;
  return { clientId, clientSecret, loginUrl };
}

export function salesforceConfigured(): boolean {
  return salesforceEnv() !== null;
}

export class SalesforceAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SalesforceAuthError";
  }
}

export class SalesforceQueryError extends Error {
  readonly errorCode: string | null;
  readonly status: number;
  constructor(message: string, status: number, errorCode: string | null) {
    super(message);
    this.name = "SalesforceQueryError";
    this.status = status;
    this.errorCode = errorCode;
  }
}

type Fetch = typeof fetch;

type Token = { accessToken: string; instanceUrl: string; obtainedAt: number };

export type SalesforceClient = {
  /** Run a SOQL query, following every page. */
  query<T = Record<string, unknown>>(soql: string): Promise<T[]>;
  /** Who the token is: the org and the Run As user. */
  whoAmI(): Promise<{
    organizationId: string | null;
    userName: string | null;
    userId: string | null;
  }>;
  /** Force a fresh token on the next call. */
  reset(): void;
};

/**
 * Salesforce returns `attributes: { type, url }` on every record and nested
 * lookup. It is transport noise; a map row or an alias never means it.
 */
export function stripAttributes<T>(value: T): T {
  if (Array.isArray(value)) return value.map(stripAttributes) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k === "attributes") continue;
      out[k] = stripAttributes(v);
    }
    return out as T;
  }
  return value;
}

async function readError(res: Response): Promise<{ message: string; errorCode: string | null }> {
  const text = await res.text().catch(() => "");
  try {
    const json = JSON.parse(text) as unknown;
    if (Array.isArray(json) && json[0] && typeof json[0] === "object") {
      const first = json[0] as { message?: string; errorCode?: string };
      return { message: first.message ?? text, errorCode: first.errorCode ?? null };
    }
    if (json && typeof json === "object") {
      const o = json as { error?: string; error_description?: string; message?: string };
      return {
        message: o.error_description ?? o.message ?? o.error ?? text,
        errorCode: o.error ?? null,
      };
    }
  } catch {
    /* not JSON */
  }
  return { message: text || `${res.status} ${res.statusText}`, errorCode: null };
}

export function createSalesforceClient(
  env: SalesforceEnv,
  fetchImpl: Fetch = fetch,
): SalesforceClient {
  let token: Token | null = null;

  async function getToken(): Promise<Token> {
    if (token) return token;
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: env.clientId,
      client_secret: env.clientSecret,
    });
    const res = await fetchImpl(`${env.loginUrl}/services/oauth2/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) {
      const e = await readError(res);
      throw new SalesforceAuthError(
        `Salesforce would not issue a token (${res.status} ${e.errorCode ?? ""}): ${e.message}. ` +
          "Check the Consumer Key and Secret, and that the Connected App has Client Credentials Flow enabled with a Run As user.",
      );
    }
    const json = (await res.json()) as { access_token?: string; instance_url?: string };
    if (!json.access_token || !json.instance_url) {
      throw new SalesforceAuthError(
        "Salesforce returned a token response without access_token/instance_url.",
      );
    }
    token = {
      accessToken: json.access_token,
      instanceUrl: json.instance_url.replace(/\/+$/, ""),
      obtainedAt: Date.now(),
    };
    return token;
  }

  async function authed(path: string, retry = true): Promise<Response> {
    const t = await getToken();
    const url = path.startsWith("http") ? path : `${t.instanceUrl}${path}`;
    const res = await fetchImpl(url, {
      headers: { authorization: `Bearer ${t.accessToken}`, accept: "application/json" },
    });
    // An expired or revoked token: get a new one, once.
    if (res.status === 401 && retry) {
      token = null;
      return authed(path, false);
    }
    return res;
  }

  return {
    async query<T = Record<string, unknown>>(soql: string): Promise<T[]> {
      const records: T[] = [];
      let next: string | null =
        `/services/data/${SALESFORCE_API_VERSION}/query?q=${encodeURIComponent(soql)}`;
      while (next) {
        const res = await authed(next);
        if (!res.ok) {
          const e = await readError(res);
          throw new SalesforceQueryError(
            `Salesforce refused the query (${res.status}${e.errorCode ? ` ${e.errorCode}` : ""}): ${e.message}`,
            res.status,
            e.errorCode,
          );
        }
        const page = (await res.json()) as {
          records?: unknown[];
          done?: boolean;
          nextRecordsUrl?: string;
        };
        for (const r of page.records ?? []) records.push(stripAttributes(r) as T);
        next = page.done === false && page.nextRecordsUrl ? page.nextRecordsUrl : null;
      }
      return records;
    },
    async whoAmI() {
      const res = await authed("/services/oauth2/userinfo");
      if (!res.ok) {
        const e = await readError(res);
        throw new SalesforceAuthError(`Salesforce would not say who the token is: ${e.message}`);
      }
      const j = (await res.json()) as {
        organization_id?: string;
        preferred_username?: string;
        email?: string;
        user_id?: string;
      };
      return {
        organizationId: j.organization_id ? (sfId18(j.organization_id) ?? j.organization_id) : null,
        userName: j.preferred_username ?? j.email ?? null,
        userId: j.user_id ?? null,
      };
    },
    reset() {
      token = null;
    },
  };
}
