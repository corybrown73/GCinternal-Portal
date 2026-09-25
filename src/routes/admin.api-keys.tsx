import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronLeft, Copy } from "lucide-react";

import { PageBody, PageHeader } from "@/components/page";
import { NoRows, Panel } from "@/components/record";
import { API_SCOPES, SCOPE_HINTS, SCOPE_PRESETS } from "@/lib/api-scopes";
import { fmtDate, fmtDateTime } from "@/lib/hub-format";
import {
  createApiKey,
  getApiKeys,
  revokeApiKey,
  updateApiKeyScopes,
} from "@/lib/presale.functions";
import type { ApiKey } from "@/lib/presale-types";
import { cn } from "@/lib/utils";

/**
 * One key per integration, least-privilege scopes.
 *
 * The scope list is the shared catalogue in src/lib/api-scopes.ts — the same
 * one the server checks against. This page used to keep its own copy, which
 * fell two scopes behind and left the MCP connector's key unable to carry the
 * scopes every one of its tools needs. Scopes are edited in place: the key is
 * the hash, and what it may do is policy about it.
 */

const keysQuery = queryOptions({
  queryKey: ["admin", "api-keys"],
  queryFn: () => getApiKeys(),
});

export const Route = createFileRoute("/admin/api-keys")({
  head: () => ({ meta: [{ title: "API keys — Admin | GoCanvas Handoff Hub" }] }),
  loader: ({ context }) => {
    void context.queryClient.ensureQueryData(keysQuery).catch(() => {});
  },
  errorComponent: ({ error }) => (
    <div role="alert" className="p-6 text-[13px] text-destructive">
      Could not load API keys: {error.message}
    </div>
  ),
  component: ApiKeysPage,
});

const inputClass =
  "h-6 w-full rounded-sm border border-border bg-background px-1.5 text-[12px] text-foreground outline-none focus:ring-1 focus:ring-ring";
const buttonClass =
  "inline-flex items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50";
const primaryButtonClass =
  "inline-flex items-center gap-1 rounded-sm bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50";
const labelClass = "text-[10px] uppercase tracking-[0.1em] text-muted-foreground";

/** The checkbox grid, with the presets above it. Used to create and to edit. */
function ScopePicker({
  value,
  onChange,
  disabled,
  compact,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const toggle = (scope: string) =>
    onChange(value.includes(scope) ? value.filter((s) => s !== scope) : [...value, scope]);
  return (
    <div>
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-[11px] text-muted-foreground">Presets:</span>
        {SCOPE_PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            className={buttonClass}
            disabled={disabled}
            onClick={() => onChange([...p.scopes])}
          >
            {p.label}
          </button>
        ))}
        <button
          type="button"
          className={buttonClass}
          disabled={disabled || value.length === 0}
          onClick={() => onChange([])}
        >
          Clear
        </button>
      </div>
      <div className={cn("mt-1 grid gap-1", compact ? "grid-cols-1" : "sm:grid-cols-2")}>
        {API_SCOPES.map((scope) => (
          <label
            key={scope}
            className="flex cursor-pointer items-start gap-2 rounded-sm border border-border px-2 py-1.5 hover:bg-muted/60"
          >
            <input
              type="checkbox"
              className="mt-0.5"
              checked={value.includes(scope)}
              disabled={disabled}
              onChange={() => toggle(scope)}
            />
            <span className="min-w-0">
              <code className="font-mono text-[11px]">{scope}</code>
              <span className="block text-[11px] text-muted-foreground">{SCOPE_HINTS[scope]}</span>
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

function isExpired(k: ApiKey): boolean {
  return Boolean(k.expires_at && new Date(k.expires_at).getTime() <= Date.now());
}

function ApiKeysPage() {
  const {
    data: { keys, limitsEnforced },
  } = useSuspenseQuery(keysQuery);
  const queryClient = useQueryClient();
  const create = useServerFn(createApiKey);
  const revoke = useServerFn(revokeApiKey);
  const update = useServerFn(updateApiKeyScopes);

  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>([]);
  // Phase 7. Both optional: a key with no expiry and the default limit behaves
  // exactly as every key created before 0025 does.
  const [expiresAt, setExpiresAt] = useState("");
  const [rateLimit, setRateLimit] = useState("");
  const [freshKey, setFreshKey] = useState<{ name: string; key: string } | null>(null);
  const [copied, setCopied] = useState(false);
  // The key whose scopes are being edited, and the draft.
  const [editing, setEditing] = useState<{ id: string; scopes: string[] } | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["admin", "api-keys"] });

  const createMutation = useMutation({
    mutationFn: () =>
      create({
        data: {
          name: name.trim(),
          scopes,
          expiresAt: expiresAt || null,
          rateLimitPerMinute: rateLimit ? Number(rateLimit) : null,
        },
      }),
    onSuccess: (result) => {
      invalidate();
      setFreshKey({ name: name.trim(), key: result.key });
      setCopied(false);
      setName("");
      setScopes([]);
      setExpiresAt("");
      setRateLimit("");
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (keyId: string) => revoke({ data: { keyId } }),
    onSuccess: invalidate,
  });

  const scopesMutation = useMutation({
    mutationFn: (v: { keyId: string; scopes: string[] }) => update({ data: v }),
    onSuccess: () => {
      setEditing(null);
      invalidate();
    },
  });

  return (
    <>
      <PageHeader
        title="API keys"
        description="One key per integration, least-privilege scopes. Keys are hashed at rest and shown exactly once. External tools call /api/v1/* with Authorization: Bearer <key>; the Claude connector calls /api/mcp with the same key."
        actions={
          <Link to="/admin" className={buttonClass}>
            <ChevronLeft className="h-3 w-3" /> Admin
          </Link>
        }
      />
      <PageBody className="max-w-4xl space-y-4">
        {freshKey ? (
          <div className="rounded-md border border-status-ontrack-foreground/40 bg-status-ontrack px-4 py-3">
            <p className="text-[13px] font-medium text-status-ontrack-foreground">
              Key created for “{freshKey.name}” — copy it now, it will not be shown again.
            </p>
            <div className="mt-2 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-sm border border-border bg-background px-2 py-1 font-mono text-[12px]">
                {freshKey.key}
              </code>
              <button
                type="button"
                className={buttonClass}
                onClick={() => {
                  void navigator.clipboard.writeText(freshKey.key).then(() => setCopied(true));
                }}
              >
                <Copy className="h-3 w-3" /> {copied ? "Copied" : "Copy"}
              </button>
              <button type="button" className={buttonClass} onClick={() => setFreshKey(null)}>
                Dismiss
              </button>
            </div>
          </div>
        ) : null}

        <Panel title="Create a key">
          <form
            className="space-y-2.5 px-3 py-2.5"
            onSubmit={(e) => {
              e.preventDefault();
              if (!createMutation.isPending) createMutation.mutate();
            }}
          >
            <div className="max-w-sm">
              <label className={labelClass}>Name *</label>
              <input
                className={inputClass}
                value={name}
                placeholder="claude-mcp-connector"
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div>
              <p className={labelClass}>Scopes * (pick the minimum this integration needs)</p>
              <div className="mt-1">
                <ScopePicker value={scopes} onChange={setScopes} />
              </div>
            </div>
            <div className="grid max-w-sm gap-2 sm:grid-cols-2">
              <div>
                <label className={labelClass}>Expires (optional)</label>
                <input
                  type="date"
                  className={inputClass}
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                />
              </div>
              <div>
                <label className={labelClass}>Requests / minute</label>
                <input
                  type="number"
                  min={1}
                  max={100000}
                  className={inputClass}
                  placeholder="120"
                  value={rateLimit}
                  onChange={(e) => setRateLimit(e.target.value)}
                />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Both are recorded whether or not enforcement is on, so you can see what would happen
              before it does. Enforcement is gated by the <code>api_key_limits</code> flag
              {limitsEnforced ? " (on)" : " (off today)"}; blank expiry means the key never expires.
            </p>
            {createMutation.isError ? (
              <p className="text-[11px] text-destructive">
                {(createMutation.error as Error).message}
              </p>
            ) : null}
            <div className="flex justify-end">
              <button
                type="submit"
                className={primaryButtonClass}
                disabled={createMutation.isPending || name.trim() === "" || scopes.length === 0}
              >
                {createMutation.isPending ? "Creating…" : "Create key"}
              </button>
            </div>
          </form>
        </Panel>

        <Panel title="Existing keys" count={keys.length}>
          {keys.length === 0 ? (
            <NoRows label="No keys yet." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="border-b border-border bg-surface text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                  <tr>
                    <th className="px-3 py-1.5 font-medium">Name</th>
                    <th className="px-3 py-1.5 font-medium">Key</th>
                    <th className="px-3 py-1.5 font-medium">Scopes</th>
                    <th className="px-3 py-1.5 font-medium">Created</th>
                    <th className="px-3 py-1.5 font-medium">Expires</th>
                    <th className="px-3 py-1.5 font-medium">Limit / min</th>
                    <th className="px-3 py-1.5 font-medium">Last used</th>
                    <th className="px-3 py-1.5 font-medium">Status</th>
                    <th className="px-3 py-1.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {keys.map((k) => {
                    const expired = isExpired(k);
                    const isEditing = editing?.id === k.id;
                    return (
                      <tr key={k.id} className="align-top hover:bg-muted/60">
                        <td className="px-3 py-1.5 text-[13px] font-medium">{k.name}</td>
                        <td className="px-3 py-1.5 font-mono text-[11px] text-muted-foreground">
                          {k.key_prefix}…
                        </td>
                        <td className="px-3 py-1.5">
                          {isEditing ? (
                            <div className="w-72 space-y-1.5">
                              <ScopePicker
                                value={editing.scopes}
                                onChange={(next) => setEditing({ id: k.id, scopes: next })}
                                disabled={scopesMutation.isPending}
                                compact
                              />
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  className={primaryButtonClass}
                                  disabled={scopesMutation.isPending || editing.scopes.length === 0}
                                  onClick={() =>
                                    scopesMutation.mutate({ keyId: k.id, scopes: editing.scopes })
                                  }
                                >
                                  {scopesMutation.isPending ? "Saving…" : "Save scopes"}
                                </button>
                                <button
                                  type="button"
                                  className={buttonClass}
                                  disabled={scopesMutation.isPending}
                                  onClick={() => setEditing(null)}
                                >
                                  Cancel
                                </button>
                              </div>
                              {scopesMutation.isError ? (
                                <p className="text-[11px] text-destructive">
                                  {(scopesMutation.error as Error).message}
                                </p>
                              ) : null}
                            </div>
                          ) : (
                            <div className="flex max-w-56 flex-wrap gap-1">
                              {k.scopes.map((s) => (
                                <code
                                  key={s}
                                  className="rounded-sm bg-muted px-1 py-0.5 font-mono text-[10px]"
                                >
                                  {s}
                                </code>
                              ))}
                              {!k.revoked_at ? (
                                <button
                                  type="button"
                                  className="text-[11px] text-primary hover:underline"
                                  onClick={() => {
                                    scopesMutation.reset();
                                    setEditing({ id: k.id, scopes: [...k.scopes] });
                                  }}
                                >
                                  Edit scopes
                                </button>
                              ) : null}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-1.5 font-mono text-[11px] text-muted-foreground">
                          {fmtDate(k.created_at)}
                        </td>
                        <td className="px-3 py-1.5 font-mono text-[11px] text-muted-foreground">
                          {k.expires_at ? (
                            <>
                              {fmtDate(k.expires_at)}
                              {expired ? (
                                <span className="ml-1 text-amber-700 dark:text-amber-400">
                                  expired
                                </span>
                              ) : null}
                              {!limitsEnforced ? (
                                <span className="block text-[10px]">(not enforced)</span>
                              ) : null}
                            </>
                          ) : (
                            "never"
                          )}
                        </td>
                        <td className="px-3 py-1.5 font-mono text-[11px] text-muted-foreground">
                          {k.rate_limit_per_minute ?? 120}
                        </td>
                        <td className="px-3 py-1.5 font-mono text-[11px] text-muted-foreground">
                          {k.last_used_at ? fmtDateTime(k.last_used_at) : "never"}
                        </td>
                        <td className="px-3 py-1.5">
                          <span
                            className={cn(
                              "inline-flex items-center rounded-sm px-1.5 py-0.5 text-[11px] font-medium",
                              k.revoked_at
                                ? "bg-status-blocked text-status-blocked-foreground"
                                : expired && limitsEnforced
                                  ? "bg-amber-500/15 text-amber-800 dark:text-amber-300"
                                  : "bg-status-ontrack text-status-ontrack-foreground",
                            )}
                          >
                            {k.revoked_at
                              ? `revoked · ${fmtDate(k.revoked_at)}`
                              : expired && limitsEnforced
                                ? "expired"
                                : "active"}
                          </span>
                        </td>
                        <td className="px-3 py-1.5 text-right">
                          {!k.revoked_at ? (
                            <button
                              type="button"
                              className="text-[11px] text-destructive hover:underline"
                              disabled={revokeMutation.isPending}
                              onClick={() => {
                                if (
                                  confirm(
                                    `Revoke “${k.name}”? Integrations using it stop working immediately.`,
                                  )
                                ) {
                                  revokeMutation.mutate(k.id);
                                }
                              }}
                            >
                              Revoke
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </PageBody>
    </>
  );
}
