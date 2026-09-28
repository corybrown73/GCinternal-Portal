import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { DEAL_TYPES } from "@/lib/stage-flow";
import { cn } from "@/lib/utils";
import { addDeal, addReport, importDeals, moveDealStage, uploadSow } from "@/lib/presale.functions";
import { parseWonGate } from "@/lib/won-gate";
import { prepareDealFn } from "@/lib/stage-flow.functions";
import { listCustomerOptions } from "@/lib/hub.functions";
import { startServicesDealFn } from "@/lib/deal-pulse.functions";
import { dealStageLabel } from "@/lib/deal-stage";
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
  /** An existing account: the customer record the services are added to. */
  customerId: string;
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
  customerId: "",
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
  const moveStage = useServerFn(moveDealStage);
  const report = useServerFn(addReport);
  const upload = useServerFn(uploadSow);
  const prepare = useServerFn(prepareDealFn);
  const startServices = useServerFn(startServicesDealFn);
  // Who already exists, for the picker and for the "this is already here"
  // hint under the name. Loaded once the dialog opens.
  const options = useQuery({
    queryKey: ["customer-options"],
    queryFn: () => listCustomerOptions(),
    enabled: open,
    staleTime: 60_000,
  });
  const typed = draft.name.trim().toLowerCase();
  const matches =
    typed.length >= 3
      ? {
          customers: (options.data?.customers ?? []).filter((c) =>
            c.name.toLowerCase().includes(typed),
          ),
          deals: (options.data?.deals ?? []).filter((d) => d.name.toLowerCase().includes(typed)),
        }
      : { customers: [], deals: [] };
  const existing = draft.path === "existing";

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
      let dealId: string;
      let result: { account: { id: string } };
      if (existing && draft.customerId) {
        // Services for a customer we already have: the add-on deal starts
        // from their record — closed, linked, inheriting what they told us
        // — the same as "Add services" on their page.
        setPhase("Starting the services deal");
        const started = await startServices({ data: { customerId: draft.customerId } });
        dealId = started.dealId;
        result = { account: { id: dealId } };
      } else {
        setPhase("Creating the account");
        result = await create({
          data: {
            name: draft.name.trim(),
            domain: nullable(draft.domain),
            salesforceId: nullable(draft.salesforceId),
            arr,
            summary: nullable(draft.summary),
            path: draft.path || "new_logo",
            industry: nullable(draft.industry),
          },
        });
        dealId = result.account.id;
      }
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
      // A deal entered in a later stage moves there now, after the notes and
      // the SOW are on it — the same gated move a person makes from the
      // board. Refused for a missing piece, the deal stays a Prospect and its
      // page says what to add; that is not a failure of the creation.
      if (!(existing && draft.customerId) && draft.stage && draft.stage !== "prospect") {
        setPhase("Moving it to its stage");
        try {
          await moveStage({ data: { dealId, toStage: draft.stage } });
        } catch (e) {
          if (!parseWonGate(e instanceof Error ? e.message : String(e))) throw e;
        }
      }
      return result;
    },
    onSuccess: (result) => {
      // The reading is started, not waited for: the brief from the calls and
      // the services from the SOW take the best part of a minute, and the
      // dialog used to sit on a spinner for all of it. The deal page shows
      // it running, and the SOW's contact and services land with it.
      if (notes.trim() || sow) {
        void prepare({ data: { dealId: result.account.id } }).catch(() => undefined);
      }
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
              Who they are, what they do, what was said on the calls. Press Create; the AI reads the
              notes and the SOW on the next screen, and the plan comes from these.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              setTouched(true);
              if (existing ? !draft.customerId : draft.name.trim() === "") return;
              if (!mutation.isPending) mutation.mutate();
            }}
          >
            <div>
              <label className={labelClass} htmlFor="new-deal-name">
                {existing ? "Customer *" : "Company *"}
              </label>
              {existing ? (
                // An existing account IS one of our customers: pick the
                // record, and the services deal hangs off it — its champion,
                // its industry and the forms they run come along.
                <select
                  id="new-deal-name"
                  name="customerId"
                  className={inputClass}
                  value={draft.customerId}
                  onChange={(e) => {
                    const c = options.data?.customers.find((x) => x.id === e.target.value);
                    set({
                      customerId: e.target.value,
                      name: c?.name ?? draft.name,
                      industry: c?.industry ?? draft.industry,
                    });
                  }}
                  aria-describedby="new-deal-name-hint"
                  autoFocus
                >
                  <option value="">
                    {options.isPending ? "Loading customers…" : "Pick the customer…"}
                  </option>
                  {(options.data?.customers ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              ) : (
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
              )}
              <p
                id="new-deal-name-hint"
                className={cn(
                  "mt-0.5 text-[11px]",
                  touched && draft.name.trim() === ""
                    ? "text-destructive"
                    : "text-muted-foreground",
                )}
              >
                {existing
                  ? draft.customerId
                    ? "The services deal starts closed on this customer's record, with what they already told us."
                    : "Not one of our customers yet? Pick a different type of deal."
                  : touched && draft.name.trim() === ""
                    ? "The account needs the company's name."
                    : "Required. Everything else can be filled in later."}
              </p>
              {!existing && (matches.customers.length || matches.deals.length) ? (
                <p role="status" className="mt-1 text-[11px] text-amber-800 dark:text-amber-300">
                  Already here:{" "}
                  {[
                    ...matches.customers.slice(0, 3).map((c) => `${c.name} (customer)`),
                    ...matches.deals
                      .slice(0, 3)
                      .map((d) => `${d.name} (deal · ${dealStageLabel(d.stage)})`),
                  ].join(", ")}
                  . For a customer we already have, choose “Existing account” and pick them — the
                  services are added to their record.
                </p>
              ) : null}
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
                  Type of deal
                </label>
                <select
                  id="new-deal-path"
                  name="path"
                  className={inputClass}
                  value={draft.path || "new_logo"}
                  onChange={(e) => set({ path: e.target.value as DealDraft["path"] })}
                >
                  {DEAL_TYPES.map((t) => (
                    <option key={t.path} value={t.path}>
                      {t.label}
                    </option>
                  ))}
                </select>
                {suggestedFf && draft.path !== "field_fusion" ? (
                  <p className="mt-0.5 text-[11px] text-amber-700 dark:text-amber-400">
                    The notes mention Field Fusion —{" "}
                    <button
                      type="button"
                      className="underline"
                      onClick={() => set({ path: "field_fusion" })}
                    >
                      make this GoCanvas training
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
                The AI reads the services and dates out of it. Without one, the plan is the first
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
                disabled={
                  mutation.isPending || (existing ? !draft.customerId : draft.name.trim() === "")
                }
              >
                {mutation.isPending
                  ? (phase ?? "Creating…")
                  : existing
                    ? "Add the services"
                    : "Create account"}
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
  const [fileError, setFileError] = useState<string | null>(null);
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
                      setFileError("That file is over 2 MB. Split the CSV and import it in parts.");
                      return;
                    }
                    setFileError(null);
                    setFileName(file.name);
                    setCsvText(await file.text());
                  }}
                />
                {fileName ? (
                  <p className="mt-1 font-mono text-[11px] text-muted-foreground">{fileName}</p>
                ) : null}
                {fileError ? (
                  <p className="mt-1 text-[11px] text-destructive" role="alert">
                    {fileError}
                  </p>
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
