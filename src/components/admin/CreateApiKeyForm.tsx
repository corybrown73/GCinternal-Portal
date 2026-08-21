"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createApiKeyAction } from "@/app/(app)/admin/api-keys/actions";

const ALL_SCOPES = [
  { id: "accounts:read", label: "Read accounts" },
  { id: "accounts:write", label: "Create/update accounts (Zapier closed-won hook)" },
  { id: "transitions:write", label: "Trigger stage transitions" },
  { id: "tam:write", label: "Create TAM requests" },
];

export function CreateApiKeyForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>([]);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  function toggle(scope: string) {
    setScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
    );
  }

  async function create() {
    setError(null);
    setBusy(true);
    try {
      const { key } = await createApiKeyAction({ name, scopes });
      setNewKey(key);
      setName("");
      setScopes([]);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create the key");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="mb-3 text-sm font-semibold">Create a key</h2>

      {newKey && (
        <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-700 dark:bg-amber-900/20">
          <p className="mb-2 font-medium">
            Copy this key now — it will never be shown again.
          </p>
          <div className="flex items-center gap-2">
            <code className="block flex-1 overflow-x-auto rounded bg-white px-2 py-1.5 font-mono text-xs dark:bg-slate-800">
              {newKey}
            </code>
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(newKey);
                setCopied(true);
              }}
              className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <button
            type="button"
            onClick={() => {
              setNewKey(null);
              setCopied(false);
            }}
            className="mt-2 text-xs text-slate-500 hover:underline"
          >
            I&apos;ve saved it — dismiss
          </button>
        </div>
      )}

      <div className="space-y-3">
        <div>
          <label htmlFor="key-name" className="mb-1 block text-xs font-medium text-slate-500">
            Name (who uses this key?)
          </label>
          <input
            id="key-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Zapier — Salesforce closed won"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-emerald-600 focus:outline-none dark:border-slate-600 dark:bg-slate-800"
          />
        </div>
        <fieldset>
          <legend className="mb-1 text-xs font-medium text-slate-500">Scopes</legend>
          <div className="space-y-1">
            {ALL_SCOPES.map((s) => (
              <label key={s.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={scopes.includes(s.id)}
                  onChange={() => toggle(s.id)}
                  className="accent-emerald-700"
                />
                <code className="text-xs">{s.id}</code>
                <span className="text-slate-500">{s.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="button"
          onClick={create}
          disabled={busy}
          className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
        >
          {busy ? "Creating…" : "Create key"}
        </button>
      </div>
    </div>
  );
}
