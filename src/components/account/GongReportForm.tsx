"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { addGongReportAction } from "@/app/(app)/actions";

const inputCls =
  "w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-emerald-600 focus:outline-none dark:border-slate-600 dark:bg-slate-800";

export function GongReportForm({ accountId }: { accountId: string }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setContent(String(reader.result ?? ""));
    reader.readAsText(file);
  }

  async function onSubmit(formData: FormData) {
    setError(null);
    setBusy(true);
    try {
      await addGongReportAction(accountId, formData);
      formRef.current?.reset();
      setContent("");
      router.refresh();
    } catch {
      setError("Couldn't save the report — check the title and content and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      ref={formRef}
      action={onSubmit}
      className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
    >
      <h3 className="text-sm font-semibold">Add a Gong report</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <label htmlFor="gr-title" className="mb-1 block text-xs font-medium text-slate-500">
            Title
          </label>
          <input
            id="gr-title"
            name="title"
            required
            placeholder="Discovery calls — Aug 2026"
            className={inputCls}
          />
        </div>
        <div>
          <label htmlFor="gr-type" className="mb-1 block text-xs font-medium text-slate-500">
            Type
          </label>
          <select id="gr-type" name="report_type" className={inputCls}>
            <option value="call_notes">Call notes</option>
            <option value="account_map">Account map (post-onboarding)</option>
          </select>
        </div>
      </div>
      <div>
        <label htmlFor="gr-content" className="mb-1 block text-xs font-medium text-slate-500">
          Report content (markdown) — paste it, or load a .md/.txt file
        </label>
        <input
          type="file"
          accept=".md,.txt,text/markdown,text/plain"
          onChange={onFile}
          className="mb-2 block text-xs text-slate-500"
        />
        <textarea
          id="gr-content"
          name="content_md"
          required
          rows={8}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="## Current process&#10;They collect inspection data on paper forms…"
          className={`${inputCls} font-mono text-xs`}
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
      >
        {busy ? "Saving…" : "Save report"}
      </button>
    </form>
  );
}
