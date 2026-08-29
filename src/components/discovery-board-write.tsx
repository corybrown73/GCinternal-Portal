import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { setImplementation, uploadAttachment } from "@/lib/hub.functions";
import { fileToBase64, MAX_ATTACHMENT_BYTES } from "@/lib/attachment-client";
import { OpenAttachment } from "@/components/sow-write";
import type { EditableImplementation } from "@/components/implementation-write";

const inputClass =
  "h-6 w-full rounded-sm border border-border bg-background px-1.5 text-[12px] text-foreground outline-none focus:ring-1 focus:ring-ring";
const areaClass =
  "min-h-[52px] w-full rounded-sm border border-border bg-background px-1.5 py-1 text-[12px] text-foreground outline-none focus:ring-1 focus:ring-ring";
const buttonClass =
  "inline-flex items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground";
const labelClass = "text-[10px] uppercase tracking-[0.1em] text-muted-foreground";

const nullable = (v: string) => (v.trim() === "" ? null : v.trim());

export type DiscoveryBoardImplementation = EditableImplementation & {
  sow_document_url: string | null;
  sow_document_name: string | null;
  discovery_board_url: string | null;
  discovery_board_image_url: string | null;
  discovery_board_image_name: string | null;
  discovery_board_notes: string | null;
};

/**
 * The discovery / design board (normally Miro) used at kickoff, attached to one
 * implementation. Supporting context only — never the structured usage record.
 */
export function DiscoveryBoardPanel({
  customerId,
  implementation,
}: {
  customerId: string;
  implementation: DiscoveryBoardImplementation;
}) {
  const queryClient = useQueryClient();
  const save = useServerFn(setImplementation);
  const upload = useServerFn(uploadAttachment);
  const [open, setOpen] = useState(false);
  const [boardUrl, setBoardUrl] = useState(implementation.discovery_board_url ?? "");
  const [notes, setNotes] = useState(implementation.discovery_board_notes ?? "");
  const [file, setFile] = useState<File | null>(null);

  const reset = () => {
    setBoardUrl(implementation.discovery_board_url ?? "");
    setNotes(implementation.discovery_board_notes ?? "");
    setFile(null);
  };

  const mutation = useMutation({
    mutationFn: async () => {
      let imagePath = implementation.discovery_board_image_url;
      let imageName = implementation.discovery_board_image_name;
      if (file) {
        if (file.size > MAX_ATTACHMENT_BYTES) {
          throw new Error("That file is too large for this preview — keep it under 4 MB.");
        }
        const stored = await upload({
          data: {
            folder: "notes" as const,
            fileName: file.name,
            contentType: file.type || "application/octet-stream",
            dataBase64: await fileToBase64(file),
          },
        });
        imagePath = stored.path;
        imageName = stored.name;
      }
      return save({
        data: {
          id: implementation.id,
          name: implementation.name,
          ownerId: implementation.owner_id,
          salesOwner: implementation.sales_owner,
          tier: implementation.tier,
          status: implementation.status as "on_track" | "at_risk" | "blocked" | "idle",
          sowReference: implementation.sow_reference,
          sowDocumentUrl: implementation.sow_document_url,
          sowDocumentName: implementation.sow_document_name,
          sowValue: implementation.sow_value,
          sowSignedDate: implementation.sow_signed_date,
          contractStartDate: implementation.contract_start_date,
          targetLaunchDate: implementation.target_launch_date,
          actualLaunchDate: implementation.actual_launch_date,
          customerGoals: implementation.customer_goals,
          discoveryBoardUrl: nullable(boardUrl),
          discoveryBoardImageUrl: imagePath,
          discoveryBoardImageName: imageName,
          discoveryBoardNotes: nullable(notes),
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
          <span className={labelClass}>Board link </span>
          {implementation.discovery_board_url ? (
            <a
              href={implementation.discovery_board_url}
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-dotted"
            >
              Open board
            </a>
          ) : (
            "Not recorded"
          )}
        </span>
        <span>
          <span className={labelClass}>Board image </span>
          {implementation.discovery_board_image_url ? (
            <span className="inline-flex items-center gap-2">
              <span>{implementation.discovery_board_image_name ?? "Attached image"}</span>
              <OpenAttachment path={implementation.discovery_board_image_url} label="View image" />
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
            {implementation.discovery_board_url || implementation.discovery_board_image_url
              ? "Edit board"
              : "Add board"}
          </button>
        ) : null}
      </div>

      {implementation.discovery_board_notes ? (
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          {implementation.discovery_board_notes}
        </p>
      ) : null}

      {open ? (
        <div className="space-y-2 rounded-sm border border-border bg-surface p-2">
          <div className="grid gap-2 md:grid-cols-2">
            <label className="block space-y-0.5">
              <span className={labelClass}>Board link</span>
              <input
                className={inputClass}
                aria-label="Board link"
                value={boardUrl}
                disabled={disabled}
                placeholder="https://miro.com/app/board/…"
                onChange={(e) => setBoardUrl(e.target.value)}
              />
            </label>
            <label className="block space-y-0.5">
              <span className={labelClass}>Board image or export</span>
              <input
                type="file"
                className="w-full text-[11px]"
                aria-label="Board image or export"
                disabled={disabled}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>
          <label className="block space-y-0.5">
            <span className={labelClass}>What the board shows (optional)</span>
            <textarea
              className={areaClass}
              aria-label="What the board shows"
              value={notes}
              disabled={disabled}
              placeholder="e.g. Kickoff workshop map of the current order-intake process"
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
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

/** Focused editor for "what the customer wants to achieve", stored on the implementation. */
export function CustomerGoalsPanel({
  customerId,
  implementation,
}: {
  customerId: string;
  implementation: DiscoveryBoardImplementation;
}) {
  const queryClient = useQueryClient();
  const save = useServerFn(setImplementation);
  const [open, setOpen] = useState(false);
  const [goals, setGoals] = useState(implementation.customer_goals ?? "");

  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          id: implementation.id,
          name: implementation.name,
          ownerId: implementation.owner_id,
          salesOwner: implementation.sales_owner,
          tier: implementation.tier,
          status: implementation.status as "on_track" | "at_risk" | "blocked" | "idle",
          sowReference: implementation.sow_reference,
          sowDocumentUrl: implementation.sow_document_url,
          sowDocumentName: implementation.sow_document_name,
          sowValue: implementation.sow_value,
          sowSignedDate: implementation.sow_signed_date,
          contractStartDate: implementation.contract_start_date,
          targetLaunchDate: implementation.target_launch_date,
          actualLaunchDate: implementation.actual_launch_date,
          customerGoals: nullable(goals),
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["customer360", customerId] });
      setOpen(false);
    },
  });

  const disabled = mutation.isPending;

  return (
    <div className="space-y-1.5">
      {!open ? (
        <div className="flex items-start gap-3">
          <p
            className={
              implementation.customer_goals
                ? "text-[15px] font-medium leading-snug text-foreground"
                : "text-[12px] text-muted-foreground"
            }
          >
            {implementation.customer_goals ?? "Not captured yet."}
          </p>

          <button
            type="button"
            className={`${buttonClass} ml-auto shrink-0`}
            onClick={() => {
              mutation.reset();
              setGoals(implementation.customer_goals ?? "");
              setOpen(true);
            }}
          >
            {implementation.customer_goals ? "Edit" : "Add"}
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <textarea
            className={areaClass}
            aria-label="What the customer wants to achieve"
            value={goals}
            disabled={disabled}
            placeholder="What does the customer want to achieve with this implementation?"
            onChange={(e) => setGoals(e.target.value)}
          />
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
                setGoals(implementation.customer_goals ?? "");
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
      )}
    </div>
  );
}
