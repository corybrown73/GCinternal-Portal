import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * The PUBLIC server functions — the only ones in the app with no auth
 * middleware, because the whole point is that the visitor has no account.
 *
 * What stands in for middleware here:
 *  - `openPlan` authenticates the raw link token (and passcode) and, only then,
 *    sets the `gc_plan` cookie on the response;
 *  - every other function accepts ONLY that cookie, re-reads the grant row
 *    behind it on every call, and derives all scope from that row. Nothing a
 *    caller sends is trusted for authorization — not an id, not a customer,
 *    not a flag.
 *
 * They are POST-only, which also makes them CSRF-resistant in the way the rest
 * of the app's mutations are, and means a link prefetcher can never trigger one.
 */

const PLAN_COOKIE = "gc_plan";

async function cookies() {
  const { getCookie, setCookie } = await import("@tanstack/react-start/server");
  return { getCookie, setCookie };
}

async function readSession(): Promise<string | undefined> {
  try {
    const { getCookie } = await cookies();
    return getCookie(PLAN_COOKIE);
  } catch {
    return undefined;
  }
}

async function writeSession(value: string): Promise<void> {
  try {
    const { setCookie } = await cookies();
    setCookie(PLAN_COOKIE, value, {
      httpOnly: true,
      secure: process.env["NODE_ENV"] === "production",
      sameSite: "lax",
      // Path "/" rather than "/plan": server functions POST to their own
      // /_serverFn route, so a /plan-scoped cookie would simply never be sent
      // with an action. HttpOnly keeps it out of script either way.
      path: "/",
      maxAge: 24 * 60 * 60,
    });
  } catch (e) {
    // A cookie that cannot be set means the visitor re-enters through their
    // link; it must never blank the page.
    console.error("[external] could not set the plan session cookie", e);
  }
}

const ref = z.string().trim().min(8).max(64);

/**
 * Verify a link and start a session. Called from the SSR loader of
 * /plan/$token, so the visitor gets a rendered plan in one round trip — the
 * /view/$token client-side useEffect pattern is deliberately NOT the model
 * here, and it is what makes the post-render open beacon meaningful.
 */
export const openPlan = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        token: z.string().trim().min(8).max(200),
        passcode: z.string().trim().max(64).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { openPlanWithToken } = await import("./external-plan.server");
    const result = await openPlanWithToken(data.token, data.passcode ?? null);
    if (result.state === "plan" && result.session) await writeSession(result.session);
    // The token never travels back to the client, and the session never travels
    // in the body — only in the HttpOnly cookie.
    return result.state === "plan"
      ? { state: "plan" as const, plan: result.plan }
      : { state: result.state, wrong: result.state === "passcode" ? result.wrong : false };
  });

/** Re-render from the session cookie alone (client navigation, after actions). */
export const getPlan = createServerFn({ method: "POST" }).handler(async () => {
  const { planForSession } = await import("./external-plan.server");
  const result = await planForSession(await readSession());
  return result.state === "plan"
    ? { state: "plan" as const, plan: result.plan }
    : { state: result.state, wrong: false };
});

/**
 * The open beacon. Fired after hydration, never from the GET — so an email
 * security scanner prefetching the link records nothing at all.
 */
export const recordPlanOpen = createServerFn({ method: "POST" }).handler(async () => {
  const { recordOpen } = await import("./external-plan.server");
  return recordOpen(await readSession());
});

export const completePlanTask = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ ref }).parse(data))
  .handler(async ({ data }) => {
    const { completeTask } = await import("./external-plan.server");
    return completeTask(await readSession(), data.ref);
  });

export const reopenPlanTask = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ ref }).parse(data))
  .handler(async ({ data }) => {
    const { reopenTask } = await import("./external-plan.server");
    return reopenTask(await readSession(), data.ref);
  });

export const commentOnPlanTask = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ ref, body: z.string().trim().min(1).max(4000) }).parse(data),
  )
  .handler(async ({ data }) => {
    const { addComment } = await import("./external-plan.server");
    return addComment(await readSession(), data.ref, data.body);
  });

/**
 * Post into the project conversation.
 *
 * No `ref`: this is the one external action that is not about a task. The
 * server takes the implementation from the session cookie's grant, re-read on
 * every request, so there is nothing here for a caller to point somewhere else.
 */
export const postPlanMessage = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ body: z.string().trim().min(1).max(20000) }).parse(data),
  )
  .handler(async ({ data }) => {
    const { postConversationMessage } = await import("./external-plan.server");
    return postConversationMessage(await readSession(), data.body);
  });

export const uploadPlanFile = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        ref,
        fileName: z.string().trim().min(1).max(255),
        mimeType: z.string().trim().min(3).max(200),
        // ~34 MB of base64 ≈ the 25 MB cap the server enforces on the decoded
        // bytes; this bound only keeps an absurd payload out of memory first.
        contentBase64: z.string().max(36_000_000),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { uploadFile } = await import("./external-plan.server");
    return uploadFile(await readSession(), data);
  });

export const reassignPlanLink = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        name: z.string().trim().min(1).max(120),
        email: z.string().trim().email().max(200),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { reassign } = await import("./external-plan.server");
    return reassign(await readSession(), data);
  });
