import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { addJournalEntry, uploadAttachment } from "@/lib/hub.functions";
import { fileToBase64, MAX_ATTACHMENT_BYTES } from "@/lib/attachment-client";
import { splitLinks } from "@/lib/journal-input";
import { OpenAttachment } from "@/components/sow-write";
import { fmtDateTime, stageLabel } from "@/lib/hub-format";
import type { JournalEntry } from "@/lib/hub-types";
import { OwnerPicker, type TeamOption } from "@/components/owner-picker";

const inputClass =
  "w-full rounded-sm border border-border bg-background px-1.5 py-1 text-[12px] text-foreground outline-none focus:ring-1 focus:ring-ring";
const buttonClass =
  "inline-flex items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground";
const labelClass = "text-[10px] uppercase tracking-[0.1em] text-muted-foreground";

/**
 * Working notes for the implementation. Writing a note records the stage the
 * implementation is in right now — the writer never picks it.
 */
export function JournalPanel({
  customerId,
  implementationId,
  currentStage,
  team,
  entries,
}: {
  customerId: string;
  implementationId: string;
  currentStage: string;
  team: TeamOption[];
  entries: JournalEntry[];
}) {
  const queryClient = useQueryClient();
  const create = useServerFn(addJournalEntry);
  const upload = useServerFn(uploadAttachment);

  const [note, setNote] = useState("");
  const [links, setLinks] = useState("");
  const [group, setGroup] = useState("");
  const [authorId, setAuthorId] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const reset = () => {
    setNote("");
    setLinks("");
    setFile(null);
  };

  const mutation = useMutation({
    mutationFn: async () => {
      let attachmentUrl: string | null = null;
      let attachmentName: string | null = null;
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
        attachmentUrl = stored.path;
        attachmentName = stored.name;
      }
      return create({
        data: {
          implementationId,
          note: note.trim(),
          authorId: authorId === "" ? null : authorId,
          links: links.trim() === "" ? null : links.trim(),
          attachmentUrl,
          attachmentName,
        },
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["customer360", customerId] });
      reset();
    },
  });

  const disabled = mutation.isPending;

  return (
    <div className="space-y-3">
      <div className="space-y-2 rounded-sm border border-border bg-surface p-2">
        <div className="text-[11px] text-muted-foreground">
          This note will be filed under the current stage:{" "}
          <span className="text-foreground">{stageLabel(currentStage)}</span>
        </div>
        <textarea
          className={`${inputClass} min-h-[64px]`}
          aria-label="Note"
          placeholder="What happened, what you decided, what's next…"
          value={note}
          disabled={disabled}
          onChange={(e) => setNote(e.target.value)}
        />
        <div className="grid gap-2 md:grid-cols-2">
          <label className="block space-y-0.5">
            <span className={labelClass}>Links (one per line)</span>
            <textarea
              className={`${inputClass} min-h-[40px]`}
              aria-label="Links"
              placeholder="https://…"
              value={links}
              disabled={disabled}
              onChange={(e) => setLinks(e.target.value)}
            />
          </label>
          <label className="block space-y-0.5">
            <span className={labelClass}>Attachment</span>
            <input
              type="file"
              className="w-full text-[11px]"
              aria-label="Attachment"
              disabled={disabled}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          <OwnerPicker
            team={team}
            group={group}
            ownerId={authorId}
            disabled={disabled}
            personLabel="Written by"
            onChange={(next) => {
              setGroup(next.group);
              setAuthorId(next.ownerId);
            }}
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={buttonClass}
            disabled={disabled || note.trim() === ""}
            onClick={() => mutation.mutate()}
          >
            {disabled ? "Saving…" : "Save note"}
          </button>
          <button
            type="button"
            className={buttonClass}
            disabled={disabled}
            onClick={() => {
              mutation.reset();
              reset();
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

      {entries.length === 0 ? (
        <p className="text-[12px] text-muted-foreground">No notes yet.</p>
      ) : (
        <ul className="space-y-2">
          {entries.map((entry) => (
            <li key={entry.id} className="rounded-sm border border-border p-2">
              <div className="flex flex-wrap items-baseline gap-x-3 text-[11px] text-muted-foreground">
                <span className="rounded-sm border border-border px-1 text-foreground">
                  {stageLabel(entry.stage)}
                </span>
                <span>{fmtDateTime(entry.created_at)}</span>
                <span>{entry.author_name ?? "Author not recorded"}</span>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-[12px] text-foreground">{entry.note}</p>
              {splitLinks(entry.links).length > 0 ? (
                <ul className="mt-1 space-y-0.5">
                  {splitLinks(entry.links).map((link) => (
                    <li key={link}>
                      <a
                        href={link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] text-primary underline"
                      >
                        {link}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : null}
              {entry.attachment_url ? (
                <div className="mt-1 flex items-center gap-2 text-[11px]">
                  <span>{entry.attachment_name ?? "Attachment"}</span>
                  <OpenAttachment path={entry.attachment_url} label="Open" />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
