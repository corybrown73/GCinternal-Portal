import { useRef, useState } from "react";
import { useScope } from "@/lib/use-scope";
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
import { IndustrySelect } from "@/components/industry-select";
import { MemberOptions } from "@/components/member-options";
import {
  DOCUMENT_UPLOAD_ACCEPT,
  DOCUMENT_UPLOAD_HINT,
  documentUploadType,
} from "@/lib/document-upload";
import { mentionsDeviceMagic, mentionsFieldFusion } from "@/lib/intake-prefill";
import { DEAL_TYPES } from "@/lib/stage-flow";
import { cn } from "@/lib/utils";
import {
  addDeal,
  addReport,
  getNewDealOwnerOptions,
  importDeals,
  saveIntake as savePartner,
  settleNewDealFn,
  uploadSow,
} from "@/lib/presale.functions";
import { PartnerChoice } from "@/components/partner-choice";
import { partnerSelectionPatch, type PartnerKey } from "@/lib/partner-implementation";
import { WON_GATE_LABEL, type WonGateMissing } from "@/lib/won-gate";
import { invalidatePaperwork } from "@/lib/paperwork-cache";
import {
  ALREADY_STAGED,
  canAssignAtEntry,
  gateParam,
  NEW_DEAL_STAGES,
  type NewDealStage,
} from "@/lib/deal-entry";
import { listCustomerOptions } from "@/lib/hub.functions";
import { startServicesDealFn } from "@/lib/deal-pulse.functions";
import { dealStageLabel } from "@/lib/deal-stage";
import { STAGE_LABELS, type AccountStage } from "@/lib/presale-stages";

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
  path: "" | "new_logo" | "existing" | "dm_conversion" | "field_fusion" | "partner_implementation";
  /** Which registered partner leads a Partner Implementation. Required for that type. */
  partnerKey: PartnerKey | "";
  industry: string;
  stage: NewDealStage;
  /** An existing account: the customer record the services are added to. */
  customerId: string;
  /** The AE; null until somebody picks, which means "me" when I am on the list. */
  amOwnerId: string | null;
  /** The TIS, from Negotiate & Finalize on. */
  implementationOwnerId: string;
};

const emptyDeal: DealDraft = {
  name: "",
  domain: "",
  salesforceId: "",
  arr: "",
  summary: "",
  path: "",
  partnerKey: "",
  industry: "",
  stage: "prospect",
  customerId: "",
  amOwnerId: null,
  implementationOwnerId: "",
};

/** The deal exists, but not where it was entered: the gate held it. */
type Held = {
  dealId: string;
  stage: AccountStage;
  missing: WonGateMissing[];
};

export function NewDealDialog() {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DealDraft>(emptyDeal);
  const [notes, setNotes] = useState("");
  const [sow, setSow] = useState<File | null>(null);
  const [more, setMore] = useState(false);
  const [touched, setTouched] = useState(false);
  const [phase, setPhase] = useState<string | null>(null);
  const [held, setHeld] = useState<Held | null>(null);
  // What already happened, so a retry after a failure part-way finishes the
  // job instead of creating a second account.
  const progress = useRef<{
    dealId: string | null;
    notes: boolean;
    sow: boolean;
    settled: boolean;
  }>({
    dealId: null,
    notes: false,
    sow: false,
    settled: false,
  });
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const create = useServerFn(addDeal);
  // Covering for somebody: the deal is theirs, so it lands on the board being looked at.
  const { param: scopeParam } = useScope();
  const coverFor = scopeParam?.startsWith("owner:") ? scopeParam.slice(6) : null;
  const settle = useServerFn(settleNewDealFn);
  const report = useServerFn(addReport);
  const upload = useServerFn(uploadSow);
  const startServices = useServerFn(startServicesDealFn);
  // Who already exists, for the picker and for the "this is already here"
  // hint under the name. Loaded once the dialog opens.
  const options = useQuery({
    queryKey: ["customer-options"],
    queryFn: () => listCustomerOptions(),
    enabled: open,
    staleTime: 60_000,
  });
  // Who can be named: the AEs, and the TIS list the Assign step shows.
  const owners = useQuery({
    queryKey: ["new-deal-owners"],
    queryFn: () => getNewDealOwnerOptions(),
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
  // The AE defaults to whoever enters the deal, when they sell or manage.
  const amList = owners.data?.am ?? [];
  const amOwnerId =
    draft.amOwnerId ?? (amList.some((o) => o.value === owners.data?.me) ? owners.data!.me : "");
  const showTis = canAssignAtEntry(draft.stage);
  const closing = draft.stage === "closed_won";

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
    setHeld(null);
    progress.current = { dealId: null, notes: false, sow: false, settled: false };
  };
  // `gate`: what the Closed Won gate said was missing, so the deal page
  // opens on it rather than on a bare "Not closed yet".
  const finish = (dealId: string, gate?: string) => {
    // The SOW may have been uploaded here: everything that reads it refetches.
    void invalidatePaperwork(queryClient, dealId);
    setOpen(false);
    reset();
    navigate({ to: "/deals/$dealId", params: { dealId }, search: gate ? { gate } : {} });
  };

  // One dialog, three things the tool needs: who, what they do, what was
  // said. The deal, the call notes and the SOW used to be three panels on
  // the record after the fact; a person's first click now leaves the
  // account ready for "Build it".
  const mutation = useMutation({
    mutationFn: async (): Promise<{ dealId: string; held: Held | null }> => {
      const arrRaw = draft.arr.trim().replace(/[$,]/g, "");
      const arr = arrRaw === "" ? null : Number(arrRaw);
      if (arr != null && !Number.isFinite(arr)) {
        throw new Error("ARR must be a number");
      }
      // Checked before anything is created: a file the server would refuse
      // used to fail after the account and the notes existed, and pressing
      // Create again made a second account.
      const sowType = sow ? documentUploadType(sow) : null;
      if (sow && !sowType) throw new Error(DOCUMENT_UPLOAD_HINT);
      // A Partner Implementation must name its partner before anything is created.
      if (draft.path === "partner_implementation" && !draft.partnerKey) {
        throw new Error("Choose which partner leads this Partner Implementation.");
      }
      const done = progress.current;
      if (existing && draft.customerId) {
        // Services for a customer we already have: the add-on deal starts
        // from their record — closed, linked, inheriting what they told us
        // — the same as "Add services" on their page.
        setPhase("Starting the services deal");
        const started = await startServices({ data: { customerId: draft.customerId } });
        done.dealId = started.dealId;
      } else if (!done.dealId) {
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
            amOwnerId: amOwnerId || null,
            ...(coverFor ? { coverFor } : {}),
          },
        });
        done.dealId = result.account.id;
        if (draft.path === "partner_implementation" && draft.partnerKey) {
          // The partner is the intake's partner_implementation, saved on the new deal.
          await savePartner({
            data: { dealId: done.dealId, patch: partnerSelectionPatch(draft.partnerKey) },
          });
        }
      }
      const dealId = done.dealId!;
      if (notes.trim() && !done.notes) {
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
        done.notes = true;
      }
      if (sow && sowType && !done.sow) {
        setPhase("Uploading the SOW");
        const dataBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onerror = () => reject(new Error("Could not read that file."));
          reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
          reader.readAsDataURL(sow);
        });
        await upload({
          data: {
            dealId,
            fileName: sow.name,
            contentType: sowType,
            dataBase64,
          },
        });
        done.sow = true;
      }
      // The stage it was entered in, after the notes and the SOW are on it —
      // the same move as "Mark Closed Won", the gate included. Refused, the
      // deal is held at Negotiate & Finalize and this dialog says why.
      if (
        !(existing && draft.customerId) &&
        !done.settled &&
        (draft.stage !== "prospect" || draft.implementationOwnerId)
      ) {
        setPhase(closing ? "Marking it Closed Won" : "Moving it to its stage");
        let entry: Awaited<ReturnType<typeof settle>>;
        try {
          entry = await settle({
            data: {
              dealId,
              stage: draft.stage,
              implementationOwnerId: showTis ? draft.implementationOwnerId || null : null,
            },
          });
        } catch (e) {
          // A retry after the first try already moved the deal (the answer
          // was lost on the way back): the job is done.
          if (e instanceof Error && e.message.includes(ALREADY_STAGED)) {
            done.settled = true;
            return { dealId, held: null };
          }
          throw e;
        }
        done.settled = true;
        if (entry.refused) {
          return { dealId, held: { dealId, stage: entry.stage, missing: entry.refused.missing } };
        }
      }
      return { dealId, held: null };
    },
    onSuccess: (r) => {
      // The reading is the server's: the notes and the SOW saved above each
      // queued it (flag permitting), and the deal page shows it running.
      if (r.held) {
        queryClient.invalidateQueries({ queryKey: ["pipeline"] });
        setPhase(null);
        setHeld(r.held);
        return;
      }
      finish(r.dealId);
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
          {held ? (
            <div className="space-y-3">
              <div
                role="alert"
                className="rounded-sm border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-900 dark:text-amber-200"
              >
                <b>Created at {STAGE_LABELS[held.stage]}, not Closed Won</b> — the deal has no{" "}
                {held.missing
                  .filter((m): m is keyof typeof WON_GATE_LABEL => m in WON_GATE_LABEL)
                  .map((m) => WON_GATE_LABEL[m])
                  .join(" and no ")}
                . Add {held.missing.length === 1 ? "it" : "them"} on the deal, then press Mark
                Closed Won.
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  className={primaryButtonClass}
                  onClick={() => finish(held.dealId, gateParam(held.missing))}
                >
                  Open the deal
                </button>
              </div>
            </div>
          ) : (
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
                      {options.isPending
                        ? "Loading customers…"
                        : options.isError
                          ? "Could not load customers"
                          : "Pick the customer…"}
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
                    // Autofocus then a click elsewhere is not a mistake: the
                    // field turns red on submit, or once something was typed.
                    onBlur={() => {
                      if (draft.name.trim() !== "") setTouched(true);
                    }}
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
                      : options.isError
                        ? null
                        : "Not one of our customers yet? Pick a different type of deal."
                    : touched && draft.name.trim() === ""
                      ? "The account needs the company's name."
                      : "Required. Everything else can be filled in later."}
                </p>
                {existing && options.isError ? (
                  <p role="alert" className="mt-0.5 text-[11px] text-destructive">
                    Could not load the customers.{" "}
                    <button
                      type="button"
                      className="underline"
                      disabled={options.isFetching}
                      onClick={() => void options.refetch()}
                    >
                      {options.isFetching ? "Trying…" : "Try again"}
                    </button>
                  </p>
                ) : null}
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
                  {existing ? (
                    // The services deal inherits the customer's industry;
                    // a pick here would not be saved, so none is offered.
                    <>
                      <span className={labelClass}>Industry</span>
                      <p className="flex h-6 items-center text-[12px] text-foreground">
                        {draft.customerId ? draft.industry || "Not set" : "—"}
                        {draft.customerId ? (
                          <span className="ml-1 text-[11px] text-muted-foreground">
                            (from their record)
                          </span>
                        ) : null}
                      </p>
                    </>
                  ) : (
                    <>
                      <label className={labelClass} htmlFor="new-deal-industry">
                        Industry
                      </label>
                      <IndustrySelect
                        id="new-deal-industry"
                        className={inputClass}
                        value={draft.industry || null}
                        onChange={(industry) => set({ industry: industry ?? "" })}
                        emptyLabel="Not sure yet"
                        live
                      />
                    </>
                  )}
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
                  {draft.path === "partner_implementation" ? (
                    <div className="mt-2">
                      <PartnerChoice
                        id="new-deal-partner"
                        value={draft.partnerKey || null}
                        onChange={(key) => set({ partnerKey: key })}
                      />
                    </div>
                  ) : null}
                  {/* The suggestion names the option it would pick, and its
                    line is reserved so the form does not jump when it appears. */}
                  <p className="mt-0.5 min-h-[16px] text-[11px] text-amber-700 dark:text-amber-400">
                    {suggestedFf && draft.path !== "field_fusion" ? (
                      <>
                        The notes mention Field Fusion —{" "}
                        <button
                          type="button"
                          className="underline"
                          onClick={() => set({ path: "field_fusion" })}
                        >
                          switch to “{DEAL_TYPES.find((t) => t.path === "field_fusion")!.label}”
                        </button>
                        ?
                      </>
                    ) : suggestedDm && draft.path !== "dm_conversion" ? (
                      <>
                        The notes mention Device Magic —{" "}
                        <button
                          type="button"
                          className="underline"
                          onClick={() => set({ path: "dm_conversion" })}
                        >
                          switch to “{DEAL_TYPES.find((t) => t.path === "dm_conversion")!.label}”
                        </button>
                        ?
                      </>
                    ) : null}
                  </p>
                </div>
              </div>
              {!existing ? (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={labelClass} htmlFor="new-deal-stage">
                      Stage
                    </label>
                    <select
                      id="new-deal-stage"
                      name="stage"
                      className={inputClass}
                      value={draft.stage}
                      onChange={(e) => set({ stage: e.target.value as NewDealStage })}
                      title="A deal that already closed can start there; the Closed Won check applies, and the move is written to the history."
                    >
                      {NEW_DEAL_STAGES.map((s) => (
                        <option key={s} value={s}>
                          {STAGE_LABELS[s]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass} htmlFor="new-deal-ae">
                      Sales owner (AE)
                    </label>
                    <select
                      id="new-deal-ae"
                      name="amOwnerId"
                      className={inputClass}
                      value={amOwnerId}
                      onChange={(e) => set({ amOwnerId: e.target.value })}
                    >
                      <option value="">
                        {owners.isPending
                          ? "Loading…"
                          : owners.isError
                            ? "Could not load the team"
                            : "Not set"}
                      </option>
                      {amList.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.value === owners.data?.me ? `${o.label} (me)` : o.label}
                        </option>
                      ))}
                    </select>
                    {owners.isError ? (
                      <p className="mt-0.5 text-[11px] text-destructive">
                        The team did not load.{" "}
                        <button
                          type="button"
                          className="underline"
                          disabled={owners.isFetching}
                          onClick={() => void owners.refetch()}
                        >
                          {owners.isFetching ? "Trying…" : "Try again"}
                        </button>
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : null}
              {!existing && closing ? (
                <p className="text-[11px] text-amber-800 dark:text-amber-300">
                  Closed Won needs a {WON_GATE_LABEL.notes} and the {WON_GATE_LABEL.sow}. Without
                  them the account is created at Negotiate & Finalize and this window lists what is
                  missing.
                </p>
              ) : null}
              {!existing && showTis ? (
                <div>
                  {owners.data?.canAssign ? (
                    <label className={labelClass} htmlFor="new-deal-tis">
                      Implementation owner (TIS, optional)
                    </label>
                  ) : (
                    <p className={labelClass}>Implementation owner (TIS)</p>
                  )}
                  {owners.isPending ? (
                    <p className="text-[11px] text-muted-foreground">Loading the team…</p>
                  ) : owners.isError ? (
                    <p className="text-[11px] text-destructive">
                      The team did not load, so the TIS cannot be picked here. Assign them on the
                      deal.
                    </p>
                  ) : owners.data?.canAssign ? (
                    <select
                      id="new-deal-tis"
                      name="implementationOwnerId"
                      className={inputClass}
                      value={draft.implementationOwnerId}
                      onChange={(e) => set({ implementationOwnerId: e.target.value })}
                    >
                      <option value="">
                        {closing ? "Next in rotation, at the close" : "Not yet — assign later"}
                      </option>
                      <MemberOptions members={owners.data.members} />
                    </select>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">
                      A manager assigns the TIS on the deal, or someone in the assignment pool takes
                      it.
                    </p>
                  )}
                </div>
              ) : null}
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
                  {closing && !existing
                    ? "Signed SOW (PDF or Word, needed for Closed Won)"
                    : "Signed SOW (PDF or Word, optional)"}
                </label>
                <input
                  id="new-deal-sow"
                  name="sow"
                  type="file"
                  accept={DOCUMENT_UPLOAD_ACCEPT}
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
                {more ? "Hide the rest" : "More: domain, Salesforce ID, ARR, summary"}
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
                <p className="text-[11px] text-destructive">
                  {(mutation.error as Error).message}
                  {progress.current.dealId && !existing ? (
                    <>
                      {" "}
                      The account was created —{" "}
                      <button
                        type="button"
                        className="underline"
                        onClick={() => finish(progress.current.dealId!)}
                      >
                        open the deal
                      </button>{" "}
                      to finish there.
                    </>
                  ) : null}
                </p>
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
                      : progress.current.dealId
                        ? "Finish"
                        : "Create account"}
                </button>
              </div>
            </form>
          )}
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
