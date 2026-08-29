import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { getAttachmentLink, setImplementation, uploadAttachment } from "@/lib/hub.functions";
import { fileToBase64, MAX_ATTACHMENT_BYTES } from "@/lib/attachment-client";
import type { EditableImplementation } from "@/components/implementation-write";

const inputClass =
  "h-6 w-full rounded-sm border border-border bg-background px-1.5 text-[12px] text-foreground outline-none focus:ring-1 focus:ring-ring";
const buttonClass =
  "inline-flex items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground";
const labelClass = "text-[10px] uppercase tracking-[0.1em] text-muted-foreground";

const nullable = (v: string) => (v.trim() === "" ? null : v.trim());

export type SowImplementation = EditableImplementation & {
  sow_document_url: string | null;
  sow_document_name: string | null;
};

/** Opens the stored document through a short-lived link. */
export function OpenAttachment({
  path,
  label,
  className,
}: {
  path: string;
  label: string;
  className?: string;
}) {
  const link = useServerFn(getAttachmentLink);
  const open = useMutation({
    mutationFn: () => link({ data: { path } }),
    onSuccess: (r: { url: string }) => {
      window.open(r.url, "_blank", "noopener,noreferrer");
    },
  });
  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        className={className ?? buttonClass}
        disabled={open.isPending}
        onClick={() => open.mutate()}
      >
        {open.isPending ? "Opening…" : label}
      </button>
      {open.isError ? (
        <span className="text-[11px] text-destructive">
          {open.error instanceof Error ? open.error.message : "Could not open the file"}
        </span>
      ) : null}
    </span>
  );
}

/**
 * The SOW for one implementation: its reference, the attached document and a way
 * to open it. Save/Cancel, like every other editor here.
 */
export function SowPanel({
  customerId,
  implementation,
}: {
  customerId: string;
  implementation: SowImplementation;
}) {
  const queryClient = useQueryClient();
  const save = useServerFn(setImplementation);
  const upload = useServerFn(uploadAttachment);
  const [open, setOpen] = useState(false);
  const [reference, setReference] = useState(implementation.sow_reference ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [documentPath, setDocumentPath] = useState(implementation.sow_document_url ?? "");
  const [documentName, setDocumentName] = useState(implementation.sow_document_name ?? "");

  const reset = () => {
    setReference(implementation.sow_reference ?? "");
    setDocumentPath(implementation.sow_document_url ?? "");
    setDocumentName(implementation.sow_document_name ?? "");
    setFile(null);
  };

  const mutation = useMutation({
    mutationFn: async () => {
      let path = nullable(documentPath);
      let name = nullable(documentName);
      if (file) {
        if (file.size > MAX_ATTACHMENT_BYTES) {
          throw new Error("That file is too large for this preview — keep it under 4 MB.");
        }
        const stored = await upload({
          data: {
            folder: "sow" as const,
            fileName: file.name,
            contentType: file.type || "application/octet-stream",
            dataBase64: await fileToBase64(file),
          },
        });
        path = stored.path;
        name = stored.name;
      }
      return save({
        data: {
          id: implementation.id,
          name: implementation.name,
          ownerId: implementation.owner_id,
          salesOwner: implementation.sales_owner,
          tier: implementation.tier,
          status: implementation.status as "on_track" | "at_risk" | "blocked" | "idle",
          sowReference: reference.trim() === "" ? null : reference.trim(),
          sowDocumentUrl: path,
          sowDocumentName: name,
          sowValue: implementation.sow_value,
          sowSignedDate: implementation.sow_signed_date,
          contractStartDate: implementation.contract_start_date,
          targetLaunchDate: implementation.target_launch_date,
          actualLaunchDate: implementation.actual_launch_date,
          customerGoals: implementation.customer_goals,
        },
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["customer360", customerId] });
      setFile(null);
      setOpen(false);
    },
  });

  const disabled = mutation.isPending;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[12px]">
        <span>
          <span className={labelClass}>Reference </span>
          {implementation.sow_reference ?? "Not recorded"}
        </span>
        <span>
          <span className={labelClass}>Document </span>
          {implementation.sow_document_url ? (
            <span className="inline-flex items-center gap-2">
              <span>{implementation.sow_document_name ?? "Attached document"}</span>
              <OpenAttachment path={implementation.sow_document_url} label="Open" />
            </span>
          ) : (
            "Nothing attached"
          )}
        </span>
        {!open ? (
          <button
            type="button"
            className={`${buttonClass} ml-auto`}
            onClick={() => {
              mutation.reset();
              reset();
              setOpen(true);
            }}
          >
            {implementation.sow_document_url ? "Replace SOW" : "Attach SOW"}
          </button>
        ) : null}
      </div>

      {open ? (
        <div className="space-y-2 rounded-sm border border-border bg-surface p-2">
          <div className="grid gap-2 md:grid-cols-2">
            <label className="block space-y-0.5">
              <span className={labelClass}>SOW reference</span>
              <input
                className={inputClass}
                aria-label="SOW reference"
                value={reference}
                disabled={disabled}
                placeholder="e.g. SOW-2026-014"
                onChange={(e) => setReference(e.target.value)}
              />
            </label>
            <label className="block space-y-0.5">
              <span className={labelClass}>SOW document</span>
              <input
                type="file"
                className="w-full text-[11px]"
                aria-label="SOW document"
                disabled={disabled}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={buttonClass}
              disabled={disabled}
              onClick={() => mutation.mutate()}
            >
              {disabled ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              className={buttonClass}
              disabled={disabled}
              onClick={() => {
                mutation.reset();
                reset();
                setOpen(false);
              }}
            >
              Cancel
            </button>
            {mutation.isError ? (
              <span className="text-[11px] text-destructive">
                {mutation.error instanceof Error
                  ? mutation.error.message
                  : "Save failed — values kept"}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
