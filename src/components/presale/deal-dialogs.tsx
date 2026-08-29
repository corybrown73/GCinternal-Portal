import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { Plus, Upload } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { addDeal, importDeals } from "@/lib/presale.functions";

const inputClass =
  "h-6 w-full rounded-sm border border-border bg-background px-1.5 text-[12px] text-foreground outline-none focus:ring-1 focus:ring-ring";
const areaClass =
  "w-full rounded-sm border border-border bg-background px-1.5 py-1 text-[12px] text-foreground outline-none focus:ring-1 focus:ring-ring";
const buttonClass =
  "inline-flex items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground";
const primaryButtonClass =
  "inline-flex items-center gap-1 rounded-sm bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50";
const labelClass = "text-[10px] uppercase tracking-[0.1em] text-muted-foreground";

const nullable = (v: string) => (v.trim() === "" ? null : v.trim());

/* ---------- New deal ---------- */

type DealDraft = {
  name: string;
  domain: string;
  salesforceId: string;
  arr: string;
  summary: string;
};

const emptyDeal: DealDraft = { name: "", domain: "", salesforceId: "", arr: "", summary: "" };

export function NewDealDialog() {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DealDraft>(emptyDeal);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const create = useServerFn(addDeal);

  const set = (patch: Partial<DealDraft>) => setDraft((d) => ({ ...d, ...patch }));

  const mutation = useMutation({
    mutationFn: async () => {
      const arrRaw = draft.arr.trim().replace(/[$,]/g, "");
      const arr = arrRaw === "" ? null : Number(arrRaw);
      if (arr != null && !Number.isFinite(arr)) {
        throw new Error("ARR must be a number");
      }
      return create({
        data: {
          name: draft.name.trim(),
          domain: nullable(draft.domain),
          salesforceId: nullable(draft.salesforceId),
          arr,
          summary: nullable(draft.summary),
        },
      });
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["pipeline"] });
      setOpen(false);
      setDraft(emptyDeal);
      navigate({ to: "/deals/$dealId", params: { dealId: result.account.id } });
    },
  });

  return (
    <>
      <button type="button" className={buttonClass} onClick={() => setOpen(true)}>
        <Plus className="h-3 w-3" /> New deal
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[14px]">New deal</DialogTitle>
            <DialogDescription className="text-[12px]">
              Creates a presale account in Prospect. Matching on Salesforce ID or name updates the
              existing record instead of duplicating it.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-2.5"
            onSubmit={(e) => {
              e.preventDefault();
              if (!mutation.isPending) mutation.mutate();
            }}
          >
            <div>
              <label className={labelClass}>Name *</label>
              <input
                className={inputClass}
                value={draft.name}
                onChange={(e) => set({ name: e.target.value })}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelClass}>Domain</label>
                <input
                  className={inputClass}
                  value={draft.domain}
                  placeholder="acme.com"
                  onChange={(e) => set({ domain: e.target.value })}
                />
              </div>
              <div>
                <label className={labelClass}>Salesforce ID</label>
                <input
                  className={inputClass}
                  value={draft.salesforceId}
                  onChange={(e) => set({ salesforceId: e.target.value })}
                />
              </div>
            </div>
            <div>
              <label className={labelClass}>ARR</label>
              <input
                className={inputClass}
                value={draft.arr}
                placeholder="120000"
                onChange={(e) => set({ arr: e.target.value })}
              />
            </div>
            <div>
              <label className={labelClass}>Summary</label>
              <textarea
                className={areaClass}
                rows={3}
                value={draft.summary}
                onChange={(e) => set({ summary: e.target.value })}
              />
            </div>
            {mutation.isError ? (
              <p className="text-[11px] text-destructive">{(mutation.error as Error).message}</p>
            ) : null}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" className={buttonClass} onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button
                type="submit"
                className={primaryButtonClass}
                disabled={mutation.isPending || draft.name.trim() === ""}
              >
                {mutation.isPending ? "Creating…" : "Create deal"}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ---------- CSV import ---------- */

type ImportSummary = {
  created: number;
  updated: number;
  stage_changes: number;
  errors: { row: number; message: string }[];
};

export function CsvImportDialog() {
  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [csvText, setCsvText] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const runImport = useServerFn(importDeals);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!csvText) throw new Error("Choose a CSV file first");
      return runImport({ data: { csv: csvText } });
    },
    onSuccess: (result) => {
      setSummary(result);
      queryClient.invalidateQueries({ queryKey: ["pipeline"] });
    },
  });

  const reset = () => {
    setFileName(null);
    setCsvText(null);
    setSummary(null);
    mutation.reset();
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <>
      <button type="button" className={buttonClass} onClick={() => setOpen(true)}>
        <Upload className="h-3 w-3" /> Import CSV
      </button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) reset();
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[14px]">Import deals from CSV</DialogTitle>
            <DialogDescription className="text-[12px]">
              Columns: name (required), salesforce_id, domain, stage, arr, am_owner_email, summary.
              Rows upsert by Salesforce ID, then by name.
            </DialogDescription>
          </DialogHeader>

          {summary ? (
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-2 text-center">
                {(
                  [
                    ["Created", summary.created],
                    ["Updated", summary.updated],
                    ["Stage changes", summary.stage_changes],
                  ] as const
                ).map(([label, n]) => (
                  <div key={label} className="rounded-sm border border-border bg-surface px-2 py-2">
                    <p className="font-mono text-[15px] font-semibold">{n}</p>
                    <p className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                      {label}
                    </p>
                  </div>
                ))}
              </div>
              {summary.errors.length > 0 ? (
                <div className="max-h-40 overflow-y-auto rounded-sm border border-border">
                  <p className="border-b border-border bg-surface px-2 py-1 text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
                    {summary.errors.length} row{summary.errors.length === 1 ? "" : "s"} skipped
                  </p>
                  <ul className="divide-y divide-border">
                    {summary.errors.map((e, i) => (
                      <li key={i} className="px-2 py-1 text-[11px]">
                        <span className="font-mono text-muted-foreground">Row {e.row}</span> ·{" "}
                        {e.message}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-[12px] text-muted-foreground">Every row imported cleanly.</p>
              )}
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" className={buttonClass} onClick={reset}>
                  Import another file
                </button>
                <button
                  type="button"
                  className={primaryButtonClass}
                  onClick={() => {
                    setOpen(false);
                    reset();
                  }}
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2.5">
              <div>
                <label className={labelClass}>CSV file (max 2 MB)</label>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="block w-full text-[12px] text-muted-foreground file:mr-2 file:rounded-sm file:border file:border-border file:bg-card file:px-2 file:py-0.5 file:text-[11px] file:text-foreground"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 2 * 1024 * 1024) {
                      setFileName(null);
                      setCsvText(null);
                      alert("CSV must be under 2 MB");
                      return;
                    }
                    setFileName(file.name);
                    setCsvText(await file.text());
                  }}
                />
                {fileName ? (
                  <p className="mt-1 font-mono text-[11px] text-muted-foreground">{fileName}</p>
                ) : null}
              </div>
              {mutation.isError ? (
                <p className="text-[11px] text-destructive">{(mutation.error as Error).message}</p>
              ) : null}
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" className={buttonClass} onClick={() => setOpen(false)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className={primaryButtonClass}
                  disabled={!csvText || mutation.isPending}
                  onClick={() => mutation.mutate()}
                >
                  {mutation.isPending ? "Importing…" : "Import"}
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
