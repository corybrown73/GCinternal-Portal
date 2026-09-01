import { apiError, requireApiKey } from "./api-auth";
import {
  FIELD_GUIDE,
  MCP_PROTOCOL_VERSION,
  rpcError,
  rpcResult,
  SERVER_INFO,
  toolResult,
  TOOL_SCOPES,
  TOOLS,
} from "./mcp";

/**
 * The MCP request loop.
 *
 * Split from the route so it is a plain function over a Request — testable,
 * and out of the file whose only job is to exist at a URL.
 */

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

export async function handleMcpRequest(request: Request): Promise<Response> {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return json(rpcError(null, -32700, "Parse error: the body is not JSON"), 400);
  }

  // Batches are a list. Notifications (no id) get no response at all.
  const single = !Array.isArray(body);
  const messages: any[] = single ? [body] : body;
  const replies: unknown[] = [];

  for (const message of messages) {
    if (message?.jsonrpc !== "2.0" || typeof message?.method !== "string") {
      replies.push(rpcError(message?.id ?? null, -32600, "Invalid Request"));
      continue;
    }
    const isNotification = message.id === undefined;
    const reply = await dispatch(request, message);
    // A notification's result is discarded; an error on one is still dropped,
    // because a notification by definition expects nothing back.
    if (!isNotification && reply !== null) replies.push(reply);
  }

  if (replies.length === 0) return new Response(null, { status: 202 });
  return json(single ? replies[0] : replies);
}

async function dispatch(request: Request, message: any): Promise<unknown | null> {
  const { id, method, params } = message;

  switch (method) {
    case "initialize":
      return rpcResult(id, {
        // Echo the client's version when it names one it can speak; otherwise
        // state ours. This is what the spec asks for.
        protocolVersion:
          typeof params?.protocolVersion === "string"
            ? params.protocolVersion
            : MCP_PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions:
          "Use this to turn a pre-sale deal into the client kickoff deck. find_deal to get an id, " +
          "get_handoff_context to read the call notes and SOW verbatim, describe_deck_fields to see " +
          "what the template accepts, then generate_kickoff_deck to render it into the account. " +
          "Read the context's `gaps` before writing anything: leaving a field out is always better " +
          "than filling it with a guess, because the deck marks a blank for the presenter and reads " +
          "an invention aloud to the customer as fact.",
      });

    case "notifications/initialized":
      return null;

    case "ping":
      return rpcResult(id, {});

    case "tools/list":
      return rpcResult(id, { tools: TOOLS });

    case "tools/call": {
      const name = params?.name as string | undefined;
      const scope = name ? TOOL_SCOPES[name] : undefined;
      if (!name || !scope) {
        return rpcError(id, -32602, `Unknown tool: ${String(name)}`);
      }

      // Authorized per call, with the scope that tool actually needs.
      const auth = await requireApiKey(request, scope);
      if (auth instanceof Response) {
        const detail = await auth
          .clone()
          .json()
          .catch(() => null);
        const code = (detail as any)?.error?.code ?? "not_authorized";
        const message = (detail as any)?.error?.message ?? "Not authorized";

        // A JSON-RPC error here is protocol-correct and practically useless:
        // every MCP client renders one as an opaque "tool execution failed",
        // so a connector configured without its key sends its owner to the
        // server logs to discover a one-line configuration mistake. This is a
        // result with isError instead, for the same reason a failing tool is —
        // whoever is looking at the conversation gets to see the actual cause.
        return rpcResult(id, toolResult(authHelp(code, message, scope), true));
      }

      try {
        const text = await runTool(name, (params?.arguments ?? {}) as Record<string, unknown>);
        return rpcResult(id, toolResult(text));
      } catch (e) {
        // A tool that fails is a RESULT with isError, not an RPC error: the
        // model is supposed to see what went wrong and try something else.
        const msg = e instanceof Error ? e.message : "The tool failed";
        return rpcResult(id, toolResult(msg, true));
      }
    }

    default:
      return rpcError(id, -32601, `Method not found: ${method}`);
  }
}

/**
 * What to actually do about it, not just what went wrong.
 *
 * The tool list is unauthenticated and every tool call is not, so the failure
 * a misconfigured connector hits is this one — and it hits it after a
 * handshake that looked entirely healthy. Saying which header is missing, and
 * which scope the key needs, turns that into a fix rather than an
 * investigation.
 */
function authHelp(code: string, message: string, scope: string): string {
  if (code === "missing_api_key") {
    return [
      "Not authorized: this request carried no API key.",
      "",
      "The MCP connector must send the portal's API key on every call. The tool",
      "list is public, which is why the connection looks healthy until a tool is",
      "actually called.",
      "",
      "Fix it where the connector is configured, by adding a header:",
      "    Authorization: Bearer gcp_live_...",
      "(x-api-key: gcp_live_... works too.)",
      "",
      `Mint the key at Admin -> API keys -> Add, with the '${scope}' scope.`,
    ].join("\n");
  }
  // The code api-auth actually emits is `missing_scope`. This branch guessed
  // `insufficient_scope` and so never fired — the first real connector to hit
  // it got the generic fallback instead of the sentence saying where to fix it.
  if (code === "missing_scope") {
    return [
      `Not authorized: this key does not have the '${scope}' scope.`,
      "",
      "Go to Admin -> API keys. Scopes are fixed when a key is created, so add a",
      "new key with both 'handoff:read' and 'handoff:write', then put it in the",
      "connector in place of the current one. Revoke the old key once it works.",
    ].join("\n");
  }
  return `Not authorized (${code}): ${message}`;
}

async function runTool(name: string, args: Record<string, unknown>): Promise<string> {
  switch (name) {
    case "describe_deck_fields":
      return JSON.stringify(
        {
          template: "Client Kickoff Deck",
          howToUse:
            "Supply only fields you can support from the notes. An omitted field renders as a visible placeholder for the presenter to complete; a wrong one gets read to the customer as fact.",
          groups: FIELD_GUIDE,
        },
        null,
        2,
      );

    case "find_deal": {
      const query = String(args["query"] ?? "").trim();
      if (!query) throw new Error("Pass a company name to search for");
      const { findDeals } = await import("./handoff-tools");
      return JSON.stringify(await findDeals(query), null, 2);
    }

    case "get_handoff_context": {
      const dealId = String(args["dealId"] ?? "").trim();
      if (!dealId) throw new Error("Pass the deal's id — use find_deal to get one");
      const { loadHandoffContext } = await import("./handoff-context");
      const context = await loadHandoffContext(dealId);
      if (!context) throw new Error(`No deal with id ${dealId}`);
      return JSON.stringify(context, null, 2);
    }

    case "generate_kickoff_deck": {
      const dealId = String(args["dealId"] ?? "").trim();
      if (!dealId) throw new Error("Pass the deal's id");
      const fields = args["fields"];
      if (!fields || typeof fields !== "object" || Array.isArray(fields)) {
        throw new Error("`fields` must be an object of field name to string value");
      }
      const { generateDeckFromMcp } = await import("./handoff-tools");
      const result = await generateDeckFromMcp({
        dealId,
        fields: fields as Record<string, unknown>,
        note: typeof args["note"] === "string" ? args["note"] : null,
      });
      return JSON.stringify(result, null, 2);
    }

    case "create_deal": {
      const { createDeal } = await import("./handoff-tools");
      return JSON.stringify(
        await createDeal({
          name: String(args["name"] ?? ""),
          domain: str(args["domain"]),
          stage: str(args["stage"]),
          primaryContactName: str(args["primaryContactName"]),
          primaryContactEmail: str(args["primaryContactEmail"]),
          primaryContactRole: str(args["primaryContactRole"]),
          summary: str(args["summary"]),
        }),
        null,
        2,
      );
    }

    case "add_call_notes": {
      const { addCallNotes } = await import("./handoff-tools");
      return JSON.stringify(
        await addCallNotes({
          dealId: String(args["dealId"] ?? ""),
          title: String(args["title"] ?? ""),
          markdown: String(args["markdown"] ?? ""),
          kind: str(args["kind"]),
        }),
        null,
        2,
      );
    }

    case "update_deal": {
      const fields = args["fields"];
      if (!fields || typeof fields !== "object" || Array.isArray(fields)) {
        throw new Error("`fields` must be an object — see the tool's description for the names");
      }
      const { updateDeal } = await import("./handoff-tools");
      return JSON.stringify(
        await updateDeal({
          dealId: String(args["dealId"] ?? ""),
          fields: fields as Record<string, unknown>,
        }),
        null,
        2,
      );
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

/** Optional string arguments: absent and empty are the same thing here. */
function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

export { apiError };
