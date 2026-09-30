import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Pencil } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { setRecordField, updateCustomer } from "@/lib/hub.functions";
import { INDUSTRIES } from "@/lib/intake-answers";

const inputClass =
  "h-8 w-full rounded-sm border border-border bg-background px-2 text-[13px] text-foreground outline-none focus:ring-1 focus:ring-ring";
const labelClass = "text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground";

/**
 * Edit the customer: name, industry, domain, Salesforce account id, ARR and
 * the implementation owner, in one form. The customer's facts write to the
 * customer; the owner writes to the project, the way the record-field edits
 * already do.
 */
export function EditCustomerDialog({
  customer,
  implementationId,
  ownerId,
  team,
}: {
  customer: {
    id: string;
    name: string;
    industry: string | null;
    domain: string | null;
    salesforce_account_id: string | null;
    arr: number | null;
  };
  implementationId: string;
  ownerId: string | null;
  team: Array<{ id: string; name: string; role: string }>;
}) {
  const qc = useQueryClient();
  const save = useServerFn(updateCustomer);
  const setField = useServerFn(setRecordField);
  const [open, setOpen] = useState(false);
  const initial = () => ({
    name: customer.name,
    industry: customer.industry ?? "",
    domain: customer.domain ?? "",
    salesforce_account_id: customer.salesforce_account_id ?? "",
    arr: customer.arr == null ? "" : String(customer.arr),
    owner_id: ownerId ?? "",
  });
  const [draft, setDraft] = useState(initial);
  useEffect(() => {
    if (open) setDraft(initial());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const m = useMutation({
    mutationFn: async () => {
      const patch: Record<string, string | number | null> = {};
      if (draft.name.trim() !== customer.name) patch["name"] = draft.name.trim();
      if ((draft.industry.trim() || null) !== (customer.industry ?? null))
        patch["industry"] = draft.industry.trim() || null;
      if ((draft.domain.trim() || null) !== (customer.domain ?? null))
        patch["domain"] = draft.domain.trim() || null;
      if ((draft.salesforce_account_id.trim() || null) !== (customer.salesforce_account_id ?? null))
        patch["salesforce_account_id"] = draft.salesforce_account_id.trim() || null;
      const arr = draft.arr.trim() === "" ? null : Number(draft.arr.replace(/[$,\s]/g, ""));
      if (arr !== null && !Number.isFinite(arr)) throw new Error("ARR has to be a number.");
      if (arr !== (customer.arr ?? null)) patch["arr"] = arr;
      if (Object.keys(patch).length) {
        await save({ data: { customerId: customer.id, patch } });
      }
      if ((draft.owner_id || null) !== (ownerId ?? null)) {
        await setField({
          data: { implementationId, field: "owner_id", value: draft.owner_id || null },
        });
      }
    },
    onSuccess: async () => {
      setOpen(false);
      await qc.invalidateQueries({ queryKey: ["customer360", customer.id] });
      void qc.invalidateQueries({ queryKey: ["home"] });
      void qc.invalidateQueries({ queryKey: ["pipeline"] });
    },
  });

  const field = (
    key: keyof ReturnType<typeof initial>,
    label: string,
    extra: React.InputHTMLAttributes<HTMLInputElement> = {},
  ) => (
    <label className="block space-y-0.5">
      <span className={labelClass}>{label}</span>
      <input
        className={inputClass}
        value={draft[key]}
        onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
        disabled={m.isPending}
        {...extra}
      />
    </label>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2.5 py-1 text-[12px] hover:bg-muted"
      >
        <Pencil className="h-3 w-3" /> Edit customer
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[14px]">Edit {customer.name}</DialogTitle>
            <DialogDescription className="text-[12px]">
              The customer's facts, and who owns this project. The customer-facing name the welcome
              page uses is on the deal's Record tab.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (draft.name.trim() && !m.isPending) m.mutate();
            }}
          >
            {field("name", "Name", { required: true })}
            <label className="block space-y-0.5">
              <span className={labelClass}>Industry</span>
              <input
                className={inputClass}
                list="edit-customer-industries"
                value={draft.industry}
                onChange={(e) => setDraft((d) => ({ ...d, industry: e.target.value }))}
                disabled={m.isPending}
                placeholder="Construction, Oil & Gas…"
              />
              <datalist id="edit-customer-industries">
                {INDUSTRIES.map((i) => (
                  <option key={i} value={i} />
                ))}
              </datalist>
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              {field("domain", "Domain", { placeholder: "acme.com" })}
              {field("salesforce_account_id", "Salesforce account ID", { placeholder: "001…" })}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {field("arr", "ARR", { placeholder: "48000", inputMode: "decimal" })}
              <label className="block space-y-0.5">
                <span className={labelClass}>Implementation owner</span>
                <select
                  className={inputClass}
                  value={draft.owner_id}
                  onChange={(e) => setDraft((d) => ({ ...d, owner_id: e.target.value }))}
                  disabled={m.isPending}
                >
                  <option value="">Unassigned</option>
                  {team.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              {m.isError ? (
                <span className="mr-auto text-[12px] text-destructive">
                  {m.error instanceof Error ? m.error.message : "Could not save."}
                </span>
              ) : null}
              <button
                type="button"
                className="rounded-md border border-border px-3 py-1.5 text-[12px] hover:bg-muted"
                onClick={() => setOpen(false)}
                disabled={m.isPending}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-md bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground disabled:opacity-50"
                disabled={m.isPending || !draft.name.trim()}
              >
                {m.isPending ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
