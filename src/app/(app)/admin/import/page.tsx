"use client";

import { useState } from "react";

interface ImportResult {
  created: number;
  updated: number;
  stage_changes: number;
  errors: { row: number; message: string }[];
}

export default function ImportPage() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setResult(null);
    const formData = new FormData(e.currentTarget);
    setBusy(true);
    try {
      const res = await fetch("/api/internal/import/csv", { method: "POST", body: formData });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? "Import failed");
      setResult(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-2 text-xl font-semibold">Import accounts from CSV</h1>
      <p className="mb-4 text-sm text-slate-500">
        Export closed-won opportunities from Salesforce and upload them here. Recognized
        columns: <code className="text-xs">Name, Salesforce ID, Domain, Stage, ARR, AM Owner Email, Summary</code>.
        Rows match existing accounts by Salesforce ID first, then by name. Stage values
        like &quot;Closed Won&quot; are normalized automatically.
      </p>

      <form
        onSubmit={onSubmit}
        className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
      >
        <input
          type="file"
          name="file"
          accept=".csv,text/csv"
          required
          className="block text-sm text-slate-600 dark:text-slate-300"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
        >
          {busy ? "Importing…" : "Import"}
        </button>
      </form>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      {result && (
        <div className="mt-5 rounded-lg border border-slate-200 bg-white p-5 text-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-2 font-semibold">Import results</h2>
          <p>
            {result.created} created · {result.updated} updated · {result.stage_changes} stage
            changes · {result.errors.length} errors
          </p>
          {result.errors.length > 0 && (
            <ul className="mt-3 space-y-1 text-red-600 dark:text-red-400">
              {result.errors.map((e, i) => (
                <li key={i}>
                  Row {e.row}: {e.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
