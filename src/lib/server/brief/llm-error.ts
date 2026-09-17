import Anthropic, { APIError } from "@anthropic-ai/sdk";

/**
 * One line a person can act on, in place of the SDK's raw "400 {json}".
 * Typed classes first, most specific first; the message of an API error is
 * kept because it names the actual problem.
 */
export function describeLlmError(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError)
    return "AI synthesis failed: the API key was rejected. Check ANTHROPIC_API_KEY on the deployment.";
  if (e instanceof Anthropic.RateLimitError)
    return "AI synthesis failed: rate limited. Try again in a minute.";
  if (e instanceof Anthropic.BadRequestError)
    return `AI synthesis failed: the request was rejected (${apiMessage(e)}).`;
  if (e instanceof Anthropic.APIError)
    return `AI synthesis failed (${e.status ?? "network"}): ${apiMessage(e)}`;
  return e instanceof Error ? e.message : "AI synthesis failed.";
}

function apiMessage(e: APIError): string {
  const body = e.error as { error?: { message?: string } } | undefined;
  return body?.error?.message ?? e.message;
}
