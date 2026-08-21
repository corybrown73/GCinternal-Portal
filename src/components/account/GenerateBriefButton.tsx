"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function GenerateBriefButton({
  accountId,
  hasReports,
}: {
  accountId: string;
  hasReports: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/internal/accounts/${accountId}/briefs`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message ?? "Generation failed");
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={generate}
        disabled={busy || !hasReports}
        title={hasReports ? undefined : "Add a Gong report first"}
        className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
      >
        {busy ? "Generating… (can take a minute)" : "Generate account brief"}
      </button>
      {!hasReports && (
        <p className="mt-1 text-xs text-slate-400">Add a Gong report first — the brief is built from it.</p>
      )}
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
}
