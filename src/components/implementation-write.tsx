import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { applyCarryover, carryoverSummary, type CarriedField } from "@/lib/deal-carryover";
import {
  addImplementation,
  getDealCarryover,
  getDealOptions,
  getTeamOptions,
  setImplementation,
  uploadAttachment,
} from "@/lib/hub.functions";
import { fileToBase64, MAX_ATTACHMENT_BYTES } from "@/lib/attachment-client";
import { OwnerPicker, groupOf } from "@/components/owner-picker";

const inputClass =
  "h-6 w-full rounded-sm border border-border bg-background px-1.5 text-[12px] text-foreground outline-none focus:ring-1 focus:ring-ring";
const selectClass = inputClass;
const areaClass =
  "w-full rounded-sm border border-border bg-background px-1.5 py-1 text-[12px] text-foreground outline-none focus:ring-1 focus:ring-ring";
const buttonClass =
  "inline-flex items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground";
const labelClass = "text-[10px] uppercase tracking-[0.1em] text-muted-foreground";

export type CustomerOption = {
  id: string;
  name: string;
  hasImplementation: boolean;
};

type Draft = {
  mode: "existing" | "new";
  customerId: string;
  customerSearch: string;
  newCustomerName: string;
  newCustomerIndustry: string;
  newCustomerRegion: string;
  newCustomerSegment: string;
  newCustomerArr: string;
  name: string;
  ownerGroup: string;
  ownerId: string;
  salesOwner: string;
  tier: string;
  sowReference: string;
  sowValue: string;
  sowSignedDate: string;
  contractStartDate: string;
  targetLaunchDate: string;
  customerGoals: string;
  externalRef: string;
  dealId: string;
  salesOwnerId: string;
  domain: string;
  contactName: string;
  contactEmail: string;
  contactRole: string;
};

const emptyDraft: Draft = {
  mode: "existing",
  customerId: "",
  customerSearch: "",
  newCustomerName: "",
  newCustomerIndustry: "",
  newCustomerRegion: "",
  newCustomerSegment: "",
  newCustomerArr: "",
  name: "",
  ownerGroup: "",
  ownerId: "",
  salesOwner: "",
  tier: "",
  sowReference: "",
  sowValue: "",
  sowSignedDate: "",
  contractStartDate: "",
  targetLaunchDate: "",
  customerGoals: "",
  externalRef: "",
  dealId: "",
  salesOwnerId: "",
  domain: "",
  contactName: "",
  contactEmail: "",
  contactRole: "",
};

const nullable = (v: string) => (v.trim() === "" ? null : v.trim());
const nullableNumber = (v: string) => {
  const t = v.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

function payload(draft: Draft) {
  return {
    customerId: draft.mode === "existing" ? nullable(draft.customerId) : null,
    newCustomer:
      draft.mode === "new"
        ? {
            name: draft.newCustomerName.trim(),
            industry: nullable(draft.newCustomerIndustry),
            region: nullable(draft.newCustomerRegion),
            segment: nullable(draft.newCustomerSegment),
            arr: nullableNumber(draft.newCustomerArr),
          }
        : null,
    name: draft.name.trim(),
    ownerId: nullable(draft.ownerId),
    salesOwner: nullable(draft.salesOwner),
    tier: nullable(draft.tier),
    sowReference: nullable(draft.sowReference),
    sowValue: nullableNumber(draft.sowValue),
    sowSignedDate: nullable(draft.sowSignedDate),
    contractStartDate: nullable(draft.contractStartDate),
    targetLaunchDate: nullable(draft.targetLaunchDate),
    customerGoals: nullable(draft.customerGoals),
    externalRef: nullable(draft.externalRef),
    dealId: nullable(draft.dealId),
    salesOwnerId: nullable(draft.salesOwnerId),
    carried: {
      domain: nullable(draft.domain),
      contactName: nullable(draft.contactName),
      contactEmail: nullable(draft.contactEmail),
      contactRole: nullable(draft.contactRole),
    },
  };
}

export function NewImplementation({ customers }: { customers: CustomerOption[] }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const create = useServerFn(addImplementation);
  const upload = useServerFn(uploadAttachment);
  const [sowFile, setSowFile] = useState<File | null>(null);

  const team = useQuery<Array<{ id: string; name: string; role: string }>>({
    queryKey: ["team-options"],
    queryFn: () => getTeamOptions(),
    enabled: open,
  });
  const deals = useQuery<
    Array<{ id: string; name: string; stage: string | null; linked_customer_id: string | null }>
  >({
    queryKey: ["deal-options"],
    queryFn: () => getDealOptions(),
    enabled: open,
  });
  const chosenDeal = (deals.data ?? []).find((d) => d.id === draft.dealId);
  const [carried, setCarried] = useState<CarriedField[]>([]);

  /**
   * Pull the deal's context in and say what came across.
   *
   * The fetch is imperative rather than a query-plus-effect on purpose: this
   * writes into a form the user is editing, and it must happen exactly once,
   * on the click that chooses the deal. A query keyed on dealId would re-run
   * on refocus and quietly re-fill fields somebody had just cleared.
   */
  const readDeal = useServerFn(getDealCarryover);
  const chooseDeal = async (dealId: string) => {
    set({ dealId });
    if (!dealId) {
      setCarried([]);
      return;
    }
    try {
      const deal = await readDeal({ data: { dealId } });
      if (!deal) return;
      setDraft((d) => {
        const result = applyCarryover(deal, {
          customerGoals: d.customerGoals,
          domain: d.domain,
          contactName: d.contactName,
          contactEmail: d.contactEmail,
          contactRole: d.contactRole,
          salesOwner: d.salesOwner,
          salesOwnerId: d.salesOwnerId,
        });
        setCarried(result.carried);
        return { ...d, ...result.target, dealId };
      });
    } catch {
      // A deal that will not load is not a reason to block creating the
      // project. The picker keeps the link; nothing is pre-filled.
      setCarried([]);
    }
  };

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  const matches = useMemo(() => {
    const q = draft.customerSearch.trim().toLowerCase();
    const list = q ? customers.filter((c) => c.name.toLowerCase().includes(q)) : customers;
    return list.slice(0, 40);
  }, [customers, draft.customerSearch]);

  const selected = customers.find((c) => c.id === draft.customerId);

  const mutation = useMutation({
    mutationFn: async () => {
      let sowDocumentUrl: string | null = null;
      let sowDocumentName: string | null = null;
      if (sowFile) {
        if (sowFile.size > MAX_ATTACHMENT_BYTES) {
          throw new Error("That file is too large for this preview — keep it under 4 MB.");
        }
        const stored = await upload({
          data: {
            folder: "sow" as const,
            fileName: sowFile.name,
            contentType: sowFile.type || "application/octet-stream",
            dataBase64: await fileToBase64(sowFile),
          },
        });
        sowDocumentUrl = stored.path;
        sowDocumentName = stored.name;
      }
      return create({ data: { ...payload(draft), sowDocumentUrl, sowDocumentName } });
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["home"] });
      setOpen(false);
      setDraft(emptyDraft);
      setCarried([]);
      setSowFile(null);
      navigate({
        to: "/customers/$customerId",
        params: { customerId: result.customerId },
        search: result.implementationId ? { impl: result.implementationId } : {},
      });
    },
  });

  const customerReady =
    draft.mode === "existing" ? draft.customerId !== "" : draft.newCustomerName.trim() !== "";
  const canSave = customerReady && draft.name.trim() !== "";

  return (
    <>
      <button
        type="button"
        className={buttonClass}
        onClick={() => {
          mutation.reset();
          setDraft(emptyDraft);
          setCarried([]);
          setOpen(true);
        }}
      >
        <Plus className="h-3 w-3" /> New implementation
      </button>

      <Dialog open={open} onOpenChange={(v) => (mutation.isPending ? null : setOpen(v))}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-[14px]">New implementation</DialogTitle>
            <DialogDescription className="text-[11px]">
              Originates the record at Handoff. Naming the deal it came from keeps the sales context
              reachable from the project; nothing else is created or inferred.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {/* Where this came from. Above the details rather than buried at
                the bottom: it is the question that explains every field below
                it, and the answer is usually already known when the dialog is
                opened from a deal. */}
            <label className="block space-y-0.5">
              <span className={labelClass}>From deal</span>
              <select
                className={selectClass}
                aria-label="From deal"
                value={draft.dealId}
                disabled={mutation.isPending || deals.isLoading}
                onChange={(e) => void chooseDeal(e.target.value)}
              >
                <option value="">
                  {deals.isLoading ? "Loading deals…" : "No deal — created here"}
                </option>
                {(deals.data ?? []).map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                    {d.stage ? ` · ${d.stage}` : ""}
                  </option>
                ))}
              </select>
              {chosenDeal && !chosenDeal.linked_customer_id ? (
                <span className="block text-[11px] text-muted-foreground">
                  This deal has no account yet. Creating the project here will not link it back —
                  use Start onboarding on the deal if you want that.
                </span>
              ) : null}
            </label>

            {/* Carried from the deal.
                Named before it is saved, because a field that fills itself
                silently is indistinguishable from one the user filled — and
                the first time that matters is when it is wrong and nobody can
                say where it came from. Every line here is editable in the form
                below; this block says which ones to look at. */}
            {draft.dealId ? (
              <div className="rounded-sm border border-border/70 bg-muted/30 p-2">
                <p className={labelClass}>Carried from the deal</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {carryoverSummary(carried)}
                </p>
                {carried.length ? (
                  <dl className="mt-1.5 space-y-0.5">
                    {carried.map((c) => (
                      <div key={c.field} className="flex gap-2 text-[11px]">
                        <dt className="w-40 shrink-0 text-muted-foreground">{c.label}</dt>
                        <dd className="min-w-0 flex-1 truncate" title={c.value}>
                          {c.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
              </div>
            ) : null}

            {/* Customer */}
            <div className="space-y-2 rounded-sm border border-border/70 bg-muted/30 p-2">
              <div className="flex items-center gap-1.5">
                <span className={labelClass}>Customer</span>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={mutation.isPending}
                  onClick={() => set({ mode: draft.mode === "existing" ? "new" : "existing" })}
                >
                  {draft.mode === "existing" ? "New customer" : "Select existing"}
                </button>
              </div>

              {draft.mode === "existing" ? (
                <div className="grid gap-2 md:grid-cols-2">
                  <label className="block space-y-0.5">
                    <span className={labelClass}>Search</span>
                    <input
                      className={inputClass}
                      aria-label="Search customers"
                      value={draft.customerSearch}
                      disabled={mutation.isPending}
                      placeholder="Filter by name"
                      onChange={(e) => set({ customerSearch: e.target.value })}
                    />
                  </label>
                  <label className="block space-y-0.5">
                    <span className={labelClass}>Existing customer</span>
                    <select
                      className={selectClass}
                      aria-label="Existing customer"
                      value={draft.customerId}
                      disabled={mutation.isPending}
                      onChange={(e) => set({ customerId: e.target.value })}
                    >
                      <option value="">Not selected</option>
                      {matches.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {selected?.hasImplementation ? (
                    <p className="md:col-span-2 text-[11px] text-status-risk-foreground">
                      This customer already has an implementation on record — Customer 360 shows
                      only the most recent implementation per customer, so creating a new one will
                      replace what&apos;s shown there.
                    </p>
                  ) : null}
                </div>
              ) : (
                <div className="grid gap-2 md:grid-cols-3">
                  <label className="block space-y-0.5">
                    <span className={labelClass}>Customer name</span>
                    <input
                      className={inputClass}
                      aria-label="Customer name"
                      value={draft.newCustomerName}
                      disabled={mutation.isPending}
                      onChange={(e) => set({ newCustomerName: e.target.value })}
                    />
                  </label>
                  <label className="block space-y-0.5">
                    <span className={labelClass}>Industry</span>
                    <input
                      className={inputClass}
                      aria-label="Industry"
                      value={draft.newCustomerIndustry}
                      disabled={mutation.isPending}
                      placeholder="Not provided"
                      onChange={(e) => set({ newCustomerIndustry: e.target.value })}
                    />
                  </label>
                  <label className="block space-y-0.5">
                    <span className={labelClass}>Region</span>
                    <input
                      className={inputClass}
                      aria-label="Region"
                      value={draft.newCustomerRegion}
                      disabled={mutation.isPending}
                      placeholder="Not provided"
                      onChange={(e) => set({ newCustomerRegion: e.target.value })}
                    />
                  </label>
                  <label className="block space-y-0.5">
                    <span className={labelClass}>Segment</span>
                    <input
                      className={inputClass}
                      aria-label="Segment"
                      value={draft.newCustomerSegment}
                      disabled={mutation.isPending}
                      placeholder="Not provided"
                      onChange={(e) => set({ newCustomerSegment: e.target.value })}
                    />
                  </label>
                  <label className="block space-y-0.5">
                    <span className={labelClass}>ARR</span>
                    <input
                      className={inputClass}
                      aria-label="ARR"
                      inputMode="decimal"
                      value={draft.newCustomerArr}
                      disabled={mutation.isPending}
                      placeholder="Not provided"
                      onChange={(e) => set({ newCustomerArr: e.target.value })}
                    />
                  </label>
                </div>
              )}
            </div>

            {/* Implementation */}
            <div className="grid gap-2 md:grid-cols-3">
              <label className="block space-y-0.5 md:col-span-2">
                <span className={labelClass}>Implementation name</span>
                <input
                  className={inputClass}
                  aria-label="Implementation name"
                  value={draft.name}
                  disabled={mutation.isPending}
                  placeholder="e.g. Core rollout — Phase 1"
                  onChange={(e) => set({ name: e.target.value })}
                />
              </label>
              <OwnerPicker
                team={team.data ?? []}
                group={draft.ownerGroup}
                ownerId={draft.ownerId}
                disabled={mutation.isPending}
                personLabel="Implementation owner"
                onChange={(next) => set({ ownerGroup: next.group, ownerId: next.ownerId })}
              />

              <label className="block space-y-0.5">
                <span className={labelClass}>Sales owner (transferred from)</span>
                <input
                  className={inputClass}
                  aria-label="Sales owner"
                  value={draft.salesOwner}
                  disabled={mutation.isPending}
                  placeholder="Not provided"
                  onChange={(e) => set({ salesOwner: e.target.value })}
                />
              </label>
              <label className="block space-y-0.5">
                <span className={labelClass}>Tier</span>
                <input
                  className={inputClass}
                  aria-label="Tier"
                  value={draft.tier}
                  disabled={mutation.isPending}
                  placeholder="e.g. Tier 1"
                  onChange={(e) => set({ tier: e.target.value })}
                />
              </label>
              <label className="block space-y-0.5">
                <span className={labelClass}>SOW reference</span>
                <input
                  className={inputClass}
                  aria-label="SOW reference"
                  value={draft.sowReference}
                  disabled={mutation.isPending}
                  placeholder="Not provided"
                  onChange={(e) => set({ sowReference: e.target.value })}
                />
              </label>
              <label className="block space-y-0.5 md:col-span-2">
                <span className={labelClass}>SOW document (optional)</span>
                <input
                  type="file"
                  className="w-full text-[11px] text-muted-foreground file:mr-2 file:rounded-sm file:border file:border-border file:bg-background file:px-1.5 file:py-0.5 file:text-[11px] file:text-foreground"
                  aria-label="SOW document"
                  disabled={mutation.isPending}
                  onChange={(e) => setSowFile(e.target.files?.[0] ?? null)}
                />
                <span className="block text-[10px] text-muted-foreground">
                  Attach the SOW now and you can analyse it from the implementation once it exists.
                </span>
              </label>
              <label className="block space-y-0.5">
                <span className={labelClass}>SOW value</span>
                <input
                  className={inputClass}
                  aria-label="SOW value"
                  inputMode="decimal"
                  value={draft.sowValue}
                  disabled={mutation.isPending}
                  placeholder="Not provided"
                  onChange={(e) => set({ sowValue: e.target.value })}
                />
              </label>
              <label className="block space-y-0.5">
                <span className={labelClass}>SOW signed date</span>
                <input
                  type="date"
                  className={inputClass}
                  aria-label="SOW signed date"
                  value={draft.sowSignedDate}
                  disabled={mutation.isPending}
                  onChange={(e) => set({ sowSignedDate: e.target.value })}
                />
              </label>
              <label className="block space-y-0.5">
                <span className={labelClass}>Contract start date</span>
                <input
                  type="date"
                  className={inputClass}
                  aria-label="Contract start date"
                  value={draft.contractStartDate}
                  disabled={mutation.isPending}
                  onChange={(e) => set({ contractStartDate: e.target.value })}
                />
              </label>
              <label className="block space-y-0.5">
                <span className={labelClass}>Target launch date</span>
                <input
                  type="date"
                  className={inputClass}
                  aria-label="Target launch date"
                  value={draft.targetLaunchDate}
                  disabled={mutation.isPending}
                  onChange={(e) => set({ targetLaunchDate: e.target.value })}
                />
              </label>
              <label className="block space-y-0.5 md:col-span-3">
                <span className={labelClass}>
                  External reference (e.g. Rocketlane / Salesforce ID)
                </span>
                <input
                  className={inputClass}
                  aria-label="External reference"
                  value={draft.externalRef}
                  disabled={mutation.isPending}
                  placeholder="Not provided"
                  onChange={(e) => set({ externalRef: e.target.value })}
                />
              </label>
              <label className="block space-y-0.5 md:col-span-3">
                <span className={labelClass}>Customer goals</span>
                <textarea
                  className={areaClass}
                  aria-label="Customer goals"
                  rows={3}
                  value={draft.customerGoals}
                  disabled={mutation.isPending}
                  placeholder="What the customer said they want to achieve"
                  onChange={(e) => set({ customerGoals: e.target.value })}
                />
              </label>
              {/* The champion and the domain. Both are CUSTOMER facts rather
                  than project ones, and both land on the customer record —
                  but this is the moment they are known, and asking for them
                  again later is how "Confirm the champion" gets ticked
                  against an empty contact list. */}
              <label className="block space-y-0.5">
                <span className={labelClass}>Contact</span>
                <input
                  className={inputClass}
                  aria-label="Contact"
                  value={draft.contactName}
                  disabled={mutation.isPending}
                  placeholder="Who to call at the customer"
                  onChange={(e) => set({ contactName: e.target.value })}
                />
              </label>
              <label className="block space-y-0.5">
                <span className={labelClass}>Contact email</span>
                <input
                  className={inputClass}
                  aria-label="Contact email"
                  type="email"
                  value={draft.contactEmail}
                  disabled={mutation.isPending}
                  placeholder="name@company.com"
                  onChange={(e) => set({ contactEmail: e.target.value })}
                />
              </label>
              <label className="block space-y-0.5">
                <span className={labelClass}>Contact role</span>
                <input
                  className={inputClass}
                  aria-label="Contact role"
                  value={draft.contactRole}
                  disabled={mutation.isPending}
                  placeholder="Champion, sponsor, ops lead"
                  onChange={(e) => set({ contactRole: e.target.value })}
                />
              </label>
              <label className="block space-y-0.5">
                <span className={labelClass}>Domain</span>
                <input
                  className={inputClass}
                  aria-label="Domain"
                  value={draft.domain}
                  disabled={mutation.isPending}
                  placeholder="company.com"
                  onChange={(e) => set({ domain: e.target.value })}
                />
              </label>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                className={buttonClass}
                disabled={mutation.isPending || !canSave}
                onClick={() => mutation.mutate()}
              >
                {mutation.isPending ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                className={buttonClass}
                disabled={mutation.isPending}
                onClick={() => {
                  mutation.reset();
                  setDraft(emptyDraft);
                  setOpen(false);
                }}
              >
                Cancel
              </button>
              {mutation.isError ? (
                <span className="text-[11px] text-destructive">
                  Save failed — values kept
                  {mutation.error instanceof Error ? `: ${mutation.error.message}` : ""}
                </span>
              ) : null}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ---------------- Edit an existing implementation ---------------- */

type EditDraft = {
  name: string;
  ownerGroup: string;
  ownerId: string;
  salesOwner: string;
  tier: string;
  status: string;
  healthRecorded: string;
  healthRecordedReason: string;
  sowReference: string;
  sowValue: string;
  sowSignedDate: string;
  contractStartDate: string;
  targetLaunchDate: string;
  actualLaunchDate: string;
  customerGoals: string;
};

const RECORDED_HEALTH_CHOICE: { value: string; label: string }[] = [
  { value: "on_track", label: "On track" },
  { value: "at_risk", label: "At risk" },
  { value: "blocked", label: "Blocked" },
];

const STATUS_CHOICE: { value: string; label: string }[] = [
  { value: "on_track", label: "On track" },
  { value: "at_risk", label: "At risk" },
  { value: "blocked", label: "Blocked" },
  { value: "idle", label: "Nothing moving" },
];

const dateOnly = (v: string | null | undefined) => (v ? String(v).slice(0, 10) : "");

export type EditableImplementation = {
  id: string;
  name: string;
  owner_id: string | null;
  sales_owner: string | null;
  tier: string | null;
  status: string;
  health_recorded?: string | null;
  health_recorded_reason?: string | null;
  sow_reference: string | null;
  sow_value: number | null;
  sow_signed_date: string | null;
  contract_start_date: string | null;
  target_launch_date: string | null;
  actual_launch_date: string | null;
  customer_goals: string | null;
};

/**
 * Deferred Save/Cancel editor for the facts of an implementation. Current stage
 * is intentionally not here — that only moves through stage advancement.
 */
export function EditImplementation({
  customerId,
  implementation,
  team,
}: {
  customerId: string;
  implementation: EditableImplementation;
  team: { id: string; name: string; role: string }[];
}) {
  const queryClient = useQueryClient();
  const save = useServerFn(setImplementation);
  const [open, setOpen] = useState(false);

  const from = (): EditDraft => ({
    name: implementation.name ?? "",
    ownerGroup: groupOf(team, implementation.owner_id),
    ownerId: implementation.owner_id ?? "",
    salesOwner: implementation.sales_owner ?? "",
    tier: implementation.tier ?? "",
    status: implementation.status ?? "on_track",
    healthRecorded: implementation.health_recorded ?? "",
    healthRecordedReason: implementation.health_recorded_reason ?? "",
    sowReference: implementation.sow_reference ?? "",
    sowValue: implementation.sow_value == null ? "" : String(implementation.sow_value),
    sowSignedDate: dateOnly(implementation.sow_signed_date),
    contractStartDate: dateOnly(implementation.contract_start_date),
    targetLaunchDate: dateOnly(implementation.target_launch_date),
    actualLaunchDate: dateOnly(implementation.actual_launch_date),
    customerGoals: implementation.customer_goals ?? "",
  });

  const [draft, setDraft] = useState<EditDraft>(from);
  const set = (patch: Partial<EditDraft>) => setDraft((d) => ({ ...d, ...patch }));

  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          id: implementation.id,
          name: draft.name.trim(),
          ownerId: nullable(draft.ownerId),
          salesOwner: nullable(draft.salesOwner),
          tier: nullable(draft.tier),
          status: draft.status as "on_track" | "at_risk" | "blocked" | "idle",
          healthRecorded: (draft.healthRecorded || null) as
            "on_track" | "at_risk" | "blocked" | null,
          healthRecordedReason: nullable(draft.healthRecordedReason),
          sowReference: nullable(draft.sowReference),
          sowValue: nullableNumber(draft.sowValue),
          sowSignedDate: nullable(draft.sowSignedDate),
          contractStartDate: nullable(draft.contractStartDate),
          targetLaunchDate: nullable(draft.targetLaunchDate),
          actualLaunchDate: nullable(draft.actualLaunchDate),
          customerGoals: nullable(draft.customerGoals),
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["customer360", customerId] });
      setOpen(false);
    },
  });

  if (!open) {
    return (
      <button
        type="button"
        className={buttonClass}
        onClick={() => {
          mutation.reset();
          setDraft(from());
          setOpen(true);
        }}
      >
        Edit details
      </button>
    );
  }

  const disabled = mutation.isPending;

  return (
    <div className="mt-2 space-y-2 rounded-sm border border-border bg-surface p-2">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <label className="block space-y-0.5 md:col-span-2">
          <span className={labelClass}>Implementation name</span>
          <input
            className={inputClass}
            aria-label="Implementation name"
            value={draft.name}
            disabled={disabled}
            onChange={(e) => set({ name: e.target.value })}
          />
        </label>
        <OwnerPicker
          team={team}
          group={draft.ownerGroup}
          ownerId={draft.ownerId}
          disabled={disabled}
          personLabel="Who owns this"
          onChange={(next) => set({ ownerGroup: next.group, ownerId: next.ownerId })}
        />
        <label className="block space-y-0.5">
          <span className={labelClass}>How it's going</span>
          <select
            className={selectClass}
            aria-label="How it's going"
            value={draft.status}
            disabled={disabled}
            onChange={(e) => set({ status: e.target.value })}
          >
            {/* Legacy rows carry the DB default 'active'; render it as an
                explicit "not set" choice so the select isn't silently blank
                and the human picks a real status. */}
            {!STATUS_CHOICE.some((s) => s.value === draft.status) && (
              <option value={draft.status}>Not set — choose one</option>
            )}
            {STATUS_CHOICE.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-0.5">
          <span className={labelClass}>Your call on health</span>
          <select
            className={selectClass}
            aria-label="Your call on health"
            value={draft.healthRecorded}
            disabled={disabled}
            onChange={(e) => set({ healthRecorded: e.target.value })}
          >
            <option value="">Not recorded</option>
            {RECORDED_HEALTH_CHOICE.map((h) => (
              <option key={h.value} value={h.value}>
                {h.label}
              </option>
            ))}
          </select>
        </label>
        {draft.healthRecorded === "at_risk" || draft.healthRecorded === "blocked" ? (
          <label className="block space-y-0.5 md:col-span-2">
            <span className={labelClass}>
              Why {draft.healthRecorded === "blocked" ? "blocked" : "at risk"} *
            </span>
            <input
              className={inputClass}
              value={draft.healthRecordedReason}
              disabled={disabled}
              placeholder="What is wrong, in one line — this is what the team acts on"
              onChange={(e) => set({ healthRecordedReason: e.target.value })}
            />
          </label>
        ) : null}
        <label className="block space-y-0.5">
          <span className={labelClass}>Target launch date</span>
          <input
            type="date"
            className={inputClass}
            aria-label="Target launch date"
            value={draft.targetLaunchDate}
            disabled={disabled}
            onChange={(e) => set({ targetLaunchDate: e.target.value })}
          />
        </label>
        <label className="block space-y-0.5">
          <span className={labelClass}>Went live on</span>
          <input
            type="date"
            className={inputClass}
            aria-label="Went live on"
            value={draft.actualLaunchDate}
            disabled={disabled}
            onChange={(e) => set({ actualLaunchDate: e.target.value })}
          />
        </label>
        <label className="block space-y-0.5">
          <span className={labelClass}>Contract start date</span>
          <input
            type="date"
            className={inputClass}
            aria-label="Contract start date"
            value={draft.contractStartDate}
            disabled={disabled}
            onChange={(e) => set({ contractStartDate: e.target.value })}
          />
        </label>
        <label className="block space-y-0.5">
          <span className={labelClass}>Tier</span>
          <input
            className={inputClass}
            aria-label="Tier"
            value={draft.tier}
            disabled={disabled}
            placeholder="Not recorded"
            onChange={(e) => set({ tier: e.target.value })}
          />
        </label>
        <label className="block space-y-0.5">
          <span className={labelClass}>Handed over by</span>
          <input
            className={inputClass}
            aria-label="Handed over by"
            value={draft.salesOwner}
            disabled={disabled}
            placeholder="Not recorded"
            onChange={(e) => set({ salesOwner: e.target.value })}
          />
        </label>
        <label className="block space-y-0.5">
          <span className={labelClass}>SOW reference</span>
          <input
            className={inputClass}
            aria-label="SOW reference"
            value={draft.sowReference}
            disabled={disabled}
            placeholder="Not recorded"
            onChange={(e) => set({ sowReference: e.target.value })}
          />
        </label>
        <label className="block space-y-0.5">
          <span className={labelClass}>SOW value</span>
          <input
            className={inputClass}
            aria-label="SOW value"
            value={draft.sowValue}
            disabled={disabled}
            placeholder="Not recorded"
            onChange={(e) => set({ sowValue: e.target.value })}
          />
        </label>
        <label className="block space-y-0.5">
          <span className={labelClass}>SOW signed date</span>
          <input
            type="date"
            className={inputClass}
            aria-label="SOW signed date"
            value={draft.sowSignedDate}
            disabled={disabled}
            onChange={(e) => set({ sowSignedDate: e.target.value })}
          />
        </label>
        <label className="block space-y-0.5 md:col-span-4">
          <span className={labelClass}>What we're trying to achieve for the customer</span>
          <textarea
            className={areaClass}
            aria-label="What we're trying to achieve for the customer"
            rows={2}
            value={draft.customerGoals}
            disabled={disabled}
            placeholder="Leave blank if it hasn't been confirmed with the customer yet"
            onChange={(e) => set({ customerGoals: e.target.value })}
          />
        </label>
      </div>
      {mutation.isError ? (
        <p className="text-[11px] text-destructive">
          Couldn&apos;t save — your entries are still here
          {mutation.error instanceof Error ? `: ${mutation.error.message}` : ""}
        </p>
      ) : null}
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-sm bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground disabled:opacity-50"
          disabled={disabled || draft.name.trim() === ""}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          className={buttonClass}
          disabled={disabled}
          onClick={() => setOpen(false)}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
