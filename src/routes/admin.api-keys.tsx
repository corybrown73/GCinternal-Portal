import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronLeft, Copy } from "lucide-react";

import { PageBody, PageHeader } from "@/components/page";
import { NoRows, Panel } from "@/components/record";
import { createApiKey, getApiKeys, revokeApiKey } from "@/lib/presale.functions";
import { fmtDateTime } from "@/lib/hub-format";
import { cn } from "@/lib/utils";

// Mirrors API_SCOPES in src/lib/server/api-auth.ts (a server-only module this
// client bundle must not import for its runtime).
const SCOPES = [
  ["accounts:read", "List and read presale accounts"],
  ["accounts:write", "Upsert accounts (Salesforce closed-won hook)"],
  ["transitions:write", "Move accounts between stages"],
  ["tam:write", "Create TAM requests"],
  ["tickets:write", "Create and update tickets"],
  ["alerts:write", "Push monitoring alerts"],
] as const;

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

function ApiKeysPage() {
  const { data: keys } = useSuspenseQuery(keysQuery);
  const queryClient = useQueryClient();
  const create = useServerFn(createApiKey);
  const revoke = useServerFn(revokeApiKey);

  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>([]);
  const [freshKey, setFreshKey] = useState<{ name: string; key: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["admin", "api-keys"] });

  const createMutation = useMutation({
    mutationFn: () => create({ data: { name: name.trim(), scopes } }),
    onSuccess: (result) => {
      invalidate();
      setFreshKey({ name: name.trim(), key: result.key });
      setCopied(false);
      setName("");
      setScopes([]);
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (keyId: string) => revoke({ data: { keyId } }),
    onSuccess: invalidate,
  });

  const toggleScope = (scope: string) =>
    setScopes((prev) => (prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]));

  return (
    <>
      <PageHeader
        title="API keys"
        description="One key per integration, least-privilege scopes. Keys are hashed at rest and shown exactly once. External tools call /api/v1/* with Authorization: Bearer <key>."
        actions={
          <Link to="/admin" className={buttonClass}>
            <ChevronLeft className="h-3 w-3" /> Admin
          </Link>
        }
      />
      <PageBody className="max-w-3xl space-y-4">
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
                placeholder="salesforce-closed-won"
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div>
              <p className={labelClass}>Scopes * (pick the minimum this integration needs)</p>
              <div className="mt-1 grid gap-1 sm:grid-cols-2">
                {SCOPES.map(([scope, hint]) => (
                  <label
                    key={scope}
                    className="flex cursor-pointer items-start gap-2 rounded-sm border border-border px-2 py-1.5 hover:bg-muted/60"
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={scopes.includes(scope)}
                      onChange={() => toggleScope(scope)}
                    />
                    <span className="min-w-0">
                      <code className="font-mono text-[11px]">{scope}</code>
                      <span className="block text-[11px] text-muted-foreground">{hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
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
                    <th className="px-3 py-1.5 font-medium">Last used</th>
                    <th className="px-3 py-1.5 font-medium">Status</th>
                    <th className="px-3 py-1.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {keys.map((k) => (
                    <tr key={k.id} className="hover:bg-muted/60">
                      <td className="px-3 py-1.5 text-[13px] font-medium">{k.name}</td>
                      <td className="px-3 py-1.5 font-mono text-[11px] text-muted-foreground">
                        {k.key_prefix}…
                      </td>
                      <td className="px-3 py-1.5">
                        <div className="flex max-w-56 flex-wrap gap-1">
                          {k.scopes.map((s) => (
                            <code
                              key={s}
                              className="rounded-sm bg-muted px-1 py-0.5 font-mono text-[10px]"
                            >
                              {s}
                            </code>
                          ))}
                        </div>
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
                              : "bg-status-ontrack text-status-ontrack-foreground",
                          )}
                        >
                          {k.revoked_at ? "revoked" : "active"}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        {!k.revoked_at ? (
                          <button
                            type="button"
                            className="text-[11px] text-destructive hover:underline"
                            disabled={revokeMutation.isPending}
                            onClick={() => {
                              if (confirm(`Revoke “${k.name}”? Integrations using it stop working immediately.`)) {
                                revokeMutation.mutate(k.id);
                              }
                            }}
                          >
                            Revoke
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </PageBody>
    </>
  );
}
