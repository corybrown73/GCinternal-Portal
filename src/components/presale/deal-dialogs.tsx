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
import { INDUSTRIES } from "@/lib/intake-answers";
import { mentionsDeviceMagic, mentionsFieldFusion } from "@/lib/intake-prefill";
import { cn } from "@/lib/utils";
import { addDeal, addReport, importDeals, uploadSow } from "@/lib/presale.functions";
import { STAGE_LABELS, STAGES, type AccountStage } from "@/lib/presale-stages";

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
  path: "" | "new_logo" | "existing" | "dm_conversion" | "field_fusion";
  industry: string;
  stage: AccountStage;
};

const emptyDeal: DealDraft = {
  name: "",
  domain: "",
  salesforceId: "",
  arr: "",
  summary: "",
  path: "",
  industry: "",
  stage: "prospect",
};

export function NewDealDialog() {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DealDraft>(emptyDeal);
  const [notes, setNotes] = useState("");
  const [sow, setSow] = useState<File | null>(null);
  const [more, setMore] = useState(false);
  const [touched, setTouched] = useState(false);
  const [phase, setPhase] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const create = useServerFn(addDeal);
  const report = useServerFn(addReport);
  const upload = useServerFn(uploadSow);

  const set = (patch: Partial<DealDraft>) => setDraft((d) => ({ ...d, ...patch }));
  // The pasted notes say what kind of account this is before anyone picks.
  const suggestedFf = mentionsFieldFusion(notes);
  const suggestedDm = !suggestedFf && mentionsDeviceMagic(notes);
  const reset = () => {
    setDraft(emptyDeal);
    setNotes("");
    setSow(null);
    setMore(false);
    setTouched(false);
    setPhase(null);
  };

  // One dialog, three things the tool needs: who, what they do, what was
  // said. The deal, the call notes and the SOW used to be three panels on
  // the record after the fact; a person's first click now leaves the
  // account ready for "Build it".
  const mutation = useMutation({
    mutationFn: async () => {
      const arrRaw = draft.arr.trim().replace(/[$,]/g, "");
      const arr = arrRaw === "" ? null : Number(arrRaw);
      if (arr != null && !Number.isFinite(arr)) {
        throw new Error("ARR must be a number");
      }
      setPhase("Creating the account");
      const result = await create({
        data: {
          name: draft.name.trim(),
          domain: nullable(draft.domain),
          salesforceId: nullable(draft.salesforceId),
          arr,
          summary: nullable(draft.summary),
          path: draft.path || "new_logo",
          industry: nullable(draft.industry),
          stage: draft.stage,
        },
      });
      const dealId = result.account.id;
      if (notes.trim()) {
        setPhase("Saving the call notes");
        await report({
          data: {
            dealId,
            title: `${draft.name.trim()} — call notes`,
            reportType: "call_notes",
            contentMd: notes.trim(),
            callDate: null,
          },
        });
      }
      if (sow) {
        setPhase("Uploading the SOW");
        const dataBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onerror = () => reject(new Error("Could not read that file."));
          reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
          reader.readAsDataURL(sow);
        });
        await upload({
          data: { dealId, fileName: sow.name, contentType: "application/pdf", dataBase64 },
        });
      }
      return result;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["pipeline"] });
      setOpen(false);
      reset();
      navigate({ to: "/deals/$dealId", params: { dealId: result.account.id } });
    },
    onError: () => setPhase(null),
  });

  return (
    <>
      <button type="button" className={buttonClass} onClick={() => setOpen(true)}>
        <Plus className="h-3 w-3" /> New account
      </button>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) reset();
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-[14px]">New account</DialogTitle>
            <DialogDescription className="text-[12px]">
              Who they are, what they do, what was said on the calls. Press Create, then Build it on
              the next screen — the deck comes from these.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              setTouched(true);
              if (draft.name.trim() === "") return;
              if (!mutation.isPending) mutation.mutate();
            }}
          >
            <div>
              <label className={labelClass} htmlFor="new-deal-name">
                Company *
              </label>
              <input
                id="new-deal-name"
                name="name"
                className={inputClass}
                value={draft.name}
                onChange={(e) => set({ name: e.target.value })}
                onBlur={() => setTouched(true)}
                aria-invalid={touched && draft.name.trim() === "" ? true : undefined}
                aria-describedby="new-deal-name-hint"
                placeholder="As the customer says it"
                autoFocus
              />
              <p
                id="new-deal-name-hint"
                className={cn(
                  "mt-0.5 text-[11px]",
                  touched && draft.name.trim() === ""
                    ? "text-destructive"
                    : "text-muted-foreground",
                )}
              >
                {touched && draft.name.trim() === ""
                  ? "The account needs the company's name."
                  : "Required. Everything else can be filled in later."}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelClass} htmlFor="new-deal-industry">
                  Industry
                </label>
                <select
                  id="new-deal-industry"
                  name="industry"
                  className={inputClass}
                  value={draft.industry}
                  onChange={(e) => set({ industry: e.target.value })}
                >
                  <option value="">Not sure yet</option>
                  {INDUSTRIES.map((i) => (
                    <option key={i} value={i}>
                      {i}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass} htmlFor="new-deal-path">
                  Kind
                </label>
                <select
                  id="new-deal-path"
                  name="path"
                  className={inputClass}
                  value={draft.path || "new_logo"}
                  onChange={(e) => set({ path: e.target.value as DealDraft["path"] })}
                >
                  <option value="new_logo">New customer — first implementation</option>
                  <option value="existing">Existing account — adding services</option>
                  <option value="dm_conversion">Device Magic → GoCanvas conversion</option>
                  <option value="field_fusion">Field Fusion — training journey</option>
                </select>
                {suggestedFf && draft.path !== "field_fusion" ? (
                  <p className="mt-0.5 text-[11px] text-amber-700 dark:text-amber-400">
                    The notes mention Field Fusion —{" "}
                    <button
                      type="button"
                      className="underline"
                      onClick={() => set({ path: "field_fusion" })}
                    >
                      make this a training journey
                    </button>
                    ?
                  </p>
                ) : null}
                {suggestedDm && draft.path !== "dm_conversion" ? (
                  <p className="mt-0.5 text-[11px] text-amber-700 dark:text-amber-400">
                    The notes mention Device Magic —{" "}
                    <button
                      type="button"
                      className="underline"
                      onClick={() => set({ path: "dm_conversion" })}
                    >
                      make this a conversion
                    </button>
                    ?
                  </p>
                ) : null}
              </div>
            </div>
            <div>
              <label className={labelClass} htmlFor="new-deal-notes">
                Call notes
              </label>
              <textarea
                id="new-deal-notes"
                name="notes"
                className={areaClass}
                rows={6}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Paste the Gong recap or your own notes. Plain text is fine. The brief, the plan and the deck are written from this."
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="new-deal-sow">
                Signed SOW (PDF, optional)
              </label>
              <input
                id="new-deal-sow"
                name="sow"
                type="file"
                accept="application/pdf,.pdf"
                className="block w-full text-[11px] text-muted-foreground file:mr-2 file:rounded-sm file:border file:border-border file:bg-background file:px-1.5 file:py-0.5 file:text-[11px] file:text-foreground"
                onChange={(e) => setSow(e.target.files?.[0] ?? null)}
              />
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Build it reads the services and dates out of it. Without one, the plan is the first
                form only.
              </p>
            </div>

            <button
              type="button"
              className="text-[11px] text-muted-foreground hover:text-foreground"
              onClick={() => setMore((v) => !v)}
            >
              {more ? "Hide the rest" : "More: domain, Salesforce ID, ARR, stage, summary"}
            </button>
            {more ? (
              <div className="space-y-2 rounded-md border border-border bg-muted/20 p-2.5">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={labelClass} htmlFor="new-deal-domain">
                      Domain
                    </label>
                    <input
                      id="new-deal-domain"
                      name="domain"
                      className={inputClass}
                      value={draft.domain}
                      placeholder="acme.com"
                      onChange={(e) => set({ domain: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className={labelClass} htmlFor="new-deal-sfid">
                      Salesforce ID
                    </label>
                    <input
                      id="new-deal-sfid"
                      name="sfid"
                      className={inputClass}
                      value={draft.salesforceId}
                      onChange={(e) => set({ salesforceId: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={labelClass} htmlFor="new-deal-arr">
                      ARR
                    </label>
                    <input
                      id="new-deal-arr"
                      name="arr"
                      className={inputClass}
                      value={draft.arr}
                      placeholder="120000"
                      onChange={(e) => set({ arr: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className={labelClass} htmlFor="new-deal-stage">
                      Stage
                    </label>
                    <select
                      id="new-deal-stage"
                      name="stage"
                      className={inputClass}
                      value={draft.stage}
                      onChange={(e) => set({ stage: e.target.value as AccountStage })}
                      title="A deal that already closed can start there; the move is written to the history."
                    >
                      {STAGES.map((s) => (
                        <option key={s} value={s}>
                          {STAGE_LABELS[s]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className={labelClass} htmlFor="new-deal-summary">
                    Summary
                  </label>
                  <textarea
                    id="new-deal-summary"
                    name="summary"
                    className={areaClass}
                    rows={2}
                    value={draft.summary}
                    onChange={(e) => set({ summary: e.target.value })}
                  />
                </div>
              </div>
            ) : null}

            {mutation.isError ? (
              <p className="text-[11px] text-destructive">{(mutation.error as Error).message}</p>
            ) : null}
            <div className="flex items-center justify-end gap-2 pt-1">
              {mutation.isPending && phase ? (
                <span className="mr-auto text-[11px] text-muted-foreground">{phase}…</span>
              ) : null}
              <button
                type="button"
                className={buttonClass}
                onClick={() => {
                  setOpen(false);
                  reset();
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className={primaryButtonClass}
                disabled={mutation.isPending || draft.name.trim() === ""}
              >
                {mutation.isPending ? "Creating…" : "Create account"}
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
