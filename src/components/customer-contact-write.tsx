import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Pencil, Plus } from "lucide-react";

import { addCustomerContact, setCustomerContact } from "@/lib/hub.functions";
import { CONTACT_ROLES, CONTACT_ROLE_LABELS, type ContactRole } from "@/lib/customer-contact-input";
import type { CustomerContactOption } from "@/lib/hub-types";

const inputClass =
  "h-6 w-full rounded-sm border border-border bg-background px-1.5 text-[12px] text-foreground outline-none focus:ring-1 focus:ring-ring";
const buttonClass =
  "inline-flex items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground";
const primaryClass =
  "inline-flex items-center gap-1 rounded-sm bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground disabled:opacity-50";
const labelClass = "text-[10px] uppercase tracking-[0.1em] text-muted-foreground";

const nullable = (v: string) => (v.trim() === "" ? null : v.trim());

type Draft = { name: string; role: ContactRole | ""; email: string; notes: string };

const emptyDraft = (): Draft => ({ name: "", role: "", email: "", notes: "" });

const isContactRole = (v: string): v is ContactRole =>
  (CONTACT_ROLES as readonly string[]).includes(v);

const draftOf = (c: CustomerContactOption): Draft => ({
  name: c.name ?? "",
  role: c.role && isContactRole(c.role) ? c.role : "",
  email: c.email ?? "",
  notes: c.notes ?? "",
});

function useInvalidate(customerId: string) {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["customer360", customerId] });
}

function ContactForm({
  draft,
  set,
  disabled,
}: {
  draft: Draft;
  set: (patch: Partial<Draft>) => void;
  disabled: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
      <label className="block space-y-0.5">
        <span className={labelClass}>Name</span>
        <input
          className={inputClass}
          aria-label="Contact name"
          value={draft.name}
          disabled={disabled}
          onChange={(e) => set({ name: e.target.value })}
        />
      </label>
      <label className="block space-y-0.5">
        <span className={labelClass}>Role</span>
        <select
          className={inputClass}
          aria-label="Contact role"
          value={draft.role}
          disabled={disabled}
          onChange={(e) => set({ role: isContactRole(e.target.value) ? e.target.value : "" })}
        >
          <option value="">Select contact type…</option>
          {CONTACT_ROLES.map((r) => (
            <option key={r} value={r}>
              {CONTACT_ROLE_LABELS[r]}
            </option>
          ))}
        </select>
      </label>
      <label className="block space-y-0.5">
        <span className={labelClass}>Email</span>
        <input
          className={inputClass}
          aria-label="Contact email"
          placeholder="Not recorded"
          value={draft.email}
          disabled={disabled}
          onChange={(e) => set({ email: e.target.value })}
        />
      </label>
      <label className="block space-y-0.5">
        <span className={labelClass}>Notes</span>
        <input
          className={inputClass}
          aria-label="Contact notes"
          placeholder="Not recorded"
          value={draft.notes}
          disabled={disabled}
          onChange={(e) => set({ notes: e.target.value })}
        />
      </label>
      <p className="col-span-2 text-[10px] leading-relaxed text-muted-foreground md:col-span-4">
        Role records the person&rsquo;s contact type. Responsibility for a success measure or usage
        area is set on that record&rsquo;s customer owner field.
      </p>
    </div>
  );
}

const ROLE_REQUIRED = "Select a contact type before saving.";

function assertRole(role: Draft["role"]): ContactRole {
  if (role === "") throw new Error(ROLE_REQUIRED);
  return role;
}

function safeMessage(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error);
  if (raw === ROLE_REQUIRED) return raw;
  if (/role/i.test(raw) && /(check|constraint|invalid|enum|violat)/i.test(raw)) {
    return ROLE_REQUIRED;
  }
  if (/(constraint|violat|sql|pgrst|column|relation)/i.test(raw)) {
    return "Could not save this contact. Check the details and try again.";
  }
  return raw;
}

export function AddCustomerContact({ customerId }: { customerId: string }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const invalidate = useInvalidate(customerId);
  const create = useServerFn(addCustomerContact);

  const mutation = useMutation({
    mutationFn: () =>
      create({
        data: {
          customerId,
          name: draft.name.trim(),
          role: assertRole(draft.role),
          email: nullable(draft.email),
          notes: nullable(draft.notes),
        },
      }),
    onSuccess: async () => {
      await invalidate();
      setDraft(emptyDraft());
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
          setDraft(emptyDraft());
          setOpen(true);
        }}
      >
        <Plus className="h-3 w-3" /> Add customer contact
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded-sm border border-border bg-surface p-2">
      <ContactForm
        draft={draft}
        set={(patch) => setDraft({ ...draft, ...patch })}
        disabled={mutation.isPending}
      />
      {mutation.isError ? (
        <p className="text-[11px] text-destructive">{safeMessage(mutation.error)}</p>
      ) : null}
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={primaryClass}
          disabled={mutation.isPending || draft.name.trim() === "" || draft.role === ""}
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
            setDraft(emptyDraft());
            setOpen(false);
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export function EditCustomerContact({
  customerId,
  contact,
}: {
  customerId: string;
  contact: CustomerContactOption;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => draftOf(contact));
  const invalidate = useInvalidate(customerId);
  const save = useServerFn(setCustomerContact);

  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          id: contact.id,
          name: draft.name.trim(),
          role: assertRole(draft.role),
          email: nullable(draft.email),
          notes: nullable(draft.notes),
        },
      }),
    onSuccess: async () => {
      await invalidate();
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
          setDraft(draftOf(contact));
          setOpen(true);
        }}
      >
        <Pencil className="h-3 w-3" /> Edit
      </button>
    );
  }

  return (
    <div className="mt-2 space-y-2 rounded-sm border border-border bg-surface p-2">
      <ContactForm
        draft={draft}
        set={(patch) => setDraft({ ...draft, ...patch })}
        disabled={mutation.isPending}
      />
      {mutation.isError ? (
        <p className="text-[11px] text-destructive">{safeMessage(mutation.error)}</p>
      ) : null}
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={primaryClass}
          disabled={mutation.isPending || draft.name.trim() === "" || draft.role === ""}
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
            setDraft(draftOf(contact));
            setOpen(false);
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
