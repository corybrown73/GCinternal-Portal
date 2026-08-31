import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Pencil, Plus } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  addSolution,
  createTechnicalSolutionNote,
  setSolutionDesign,
  setTechnicalSolutionOwner,
  setTechnicalSolutionStatus,
  uploadAttachment,
} from "@/lib/hub.functions";
import { NOTE_TYPES, SOLUTION_STATUSES, TECHNICAL_SOLUTIONS_ROLE } from "@/lib/solution-enums";
import type { TeamMemberOption } from "@/lib/hub-types";
import { humanize } from "@/lib/hub-format";
import { fileToBase64, MAX_ATTACHMENT_BYTES } from "@/lib/attachment-client";
import { OwnerPicker } from "@/components/owner-picker";

const selectClass =
  "h-6 rounded-sm border border-border bg-background px-1.5 text-[12px] text-foreground outline-none focus:ring-1 focus:ring-ring";

const iconButtonClass =
  "inline-flex items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground";

function useInvalidate(id: string) {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["technical-solution", id] });
}

export function OwnerEditor({
  solutionId,
  ownerId,
  ownerName,
  team,
}: {
  solutionId: string;
  ownerId: string | null;
  ownerName: string | null;
  team: TeamMemberOption[];
}) {
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState<string>(ownerId ?? "");
  const invalidate = useInvalidate(solutionId);
  const save = useServerFn(setTechnicalSolutionOwner);
  const mutation = useMutation({
    mutationFn: (next: string | null) => save({ data: { id: solutionId, ownerId: next } }),
    onSuccess: async () => {
      await invalidate();
      setEditing(false);
    },
  });

  const options = team.filter((m) => m.role === TECHNICAL_SOLUTIONS_ROLE);

  if (!editing) {
    return (
      <span className="flex items-center gap-2">
        <span>{ownerName ?? "Unassigned"}</span>
        <button
          type="button"
          className={iconButtonClass}
          onClick={() => {
            setPending(ownerId ?? "");
            mutation.reset();
            setEditing(true);
          }}
        >
          <Pencil className="h-3 w-3" /> Assign owner
        </button>
      </span>
    );
  }

  return (
    <span className="flex items-center gap-2">
      <select
        aria-label="Solution owner"
        className={selectClass}
        value={pending}
        disabled={mutation.isPending}
        onChange={(e) => setPending(e.target.value)}
      >
        <option value="">Unassigned</option>
        {options.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
      <button
        type="button"
        className={iconButtonClass}
        disabled={mutation.isPending || pending === (ownerId ?? "")}
        onClick={() => mutation.mutate(pending === "" ? null : pending)}
      >
        Save
      </button>
      <button
        type="button"
        className={iconButtonClass}
        disabled={mutation.isPending}
        onClick={() => {
          setPending(ownerId ?? "");
          mutation.reset();
          setEditing(false);
        }}
      >
        Cancel
      </button>
      {mutation.isError ? <span className="text-[11px] text-destructive">Save failed</span> : null}
    </span>
  );
}

export function StatusEditor({ solutionId, status }: { solutionId: string; status: string }) {
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState<string>(status);
  const invalidate = useInvalidate(solutionId);
  const save = useServerFn(setTechnicalSolutionStatus);
  const mutation = useMutation({
    mutationFn: (next: string) =>
      save({ data: { id: solutionId, status: next as (typeof SOLUTION_STATUSES)[number] } }),
    onSuccess: async () => {
      await invalidate();
      setEditing(false);
    },
  });

  if (!editing) {
    return (
      <button
        type="button"
        className={iconButtonClass}
        onClick={() => {
          setPending(status);
          mutation.reset();
          setEditing(true);
        }}
      >
        <Pencil className="h-3 w-3" /> Status
      </button>
    );
  }

  return (
    <span className="flex items-center gap-2">
      <select
        aria-label="Solution status"
        className={selectClass}
        value={pending}
        disabled={mutation.isPending}
        onChange={(e) => setPending(e.target.value)}
      >
        {SOLUTION_STATUSES.map((s) => (
          <option key={s} value={s}>
            {humanize(s)}
          </option>
        ))}
      </select>
      <button
        type="button"
        className={iconButtonClass}
        disabled={mutation.isPending || pending === status}
        onClick={() => mutation.mutate(pending)}
      >
        Save
      </button>
      <button
        type="button"
        className={iconButtonClass}
        disabled={mutation.isPending}
        onClick={() => {
          setPending(status);
          mutation.reset();
          setEditing(false);
        }}
      >
        Cancel
      </button>
      {mutation.isError ? <span className="text-[11px] text-destructive">Save failed</span> : null}
    </span>
  );
}

/**
 * Working notes for the Technical Solutions team, written from inside the
 * solution they belong to. The solution is taken from the page — never picked in
 * the form — so an entry stays with the solution it was written against.
 */
export function AddNoteAction({
  solutionId,
  team,
}: {
  solutionId: string;
  team: TeamMemberOption[];
}) {
  const [open, setOpen] = useState(false);
  const [noteType, setNoteType] = useState<string>(NOTE_TYPES[0]);
  const [content, setContent] = useState("");
  const [links, setLinks] = useState("");
  const [group, setGroup] = useState(TECHNICAL_SOLUTIONS_ROLE);
  const [authorId, setAuthorId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const invalidate = useInvalidate(solutionId);
  const save = useServerFn(createTechnicalSolutionNote);
  const upload = useServerFn(uploadAttachment);

  const reset = () => {
    setNoteType(NOTE_TYPES[0]);
    setContent("");
    setLinks("");
    setGroup(TECHNICAL_SOLUTIONS_ROLE);
    setAuthorId("");
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
            folder: "solution" as const,
            fileName: file.name,
            contentType: file.type || "application/octet-stream",
            dataBase64: await fileToBase64(file),
          },
        });
        attachmentUrl = stored.path;
        attachmentName = stored.name;
      }
      return save({
        data: {
          technicalSolutionId: solutionId,
          noteType: noteType as (typeof NOTE_TYPES)[number],
          content: content.trim(),
          authorId: authorId === "" ? null : authorId,
          links: links.trim() === "" ? null : links.trim(),
          attachmentUrl,
          attachmentName,
        },
      });
    },
    onSuccess: async () => {
      await invalidate();
      setOpen(false);
      reset();
    },
  });

  return (
    <>
      <button type="button" className={iconButtonClass} onClick={() => setOpen(true)}>
        <Plus className="h-3 w-3" /> Add note
      </button>
      <Dialog open={open} onOpenChange={(v) => (mutation.isPending ? null : setOpen(v))}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-[14px]">Add journal entry</DialogTitle>
            <DialogDescription className="text-[12px]">
              Filed against this solution and kept as written — entries cannot be changed or removed
              once saved.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <label className="block space-y-1">
              <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
                Kind of note
              </span>
              <select
                className={`${selectClass} h-7 w-full`}
                value={noteType}
                disabled={mutation.isPending}
                onChange={(e) => setNoteType(e.target.value)}
              >
                {NOTE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {humanize(t)}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-1">
              <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
                What you found, decided or discussed
              </span>
              <textarea
                className="min-h-24 w-full rounded-sm border border-border bg-background px-2 py-1.5 text-[12px] leading-relaxed outline-none focus:ring-1 focus:ring-ring"
                value={content}
                disabled={mutation.isPending}
                onChange={(e) => setContent(e.target.value)}
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1">
                <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
                  Links (one per line)
                </span>
                <textarea
                  className="min-h-10 w-full rounded-sm border border-border bg-background px-2 py-1.5 text-[12px] outline-none focus:ring-1 focus:ring-ring"
                  placeholder="https://…"
                  value={links}
                  disabled={mutation.isPending}
                  onChange={(e) => setLinks(e.target.value)}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
                  Attachment
                </span>
                <input
                  type="file"
                  className="w-full text-[11px]"
                  aria-label="Attachment"
                  disabled={mutation.isPending}
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <OwnerPicker
                team={team}
                group={group}
                ownerId={authorId}
                disabled={mutation.isPending}
                personLabel="Written by"
                onChange={(next) => {
                  setGroup(next.group);
                  setAuthorId(next.ownerId);
                }}
              />
            </div>

            {mutation.isError ? (
              <p className="text-[11px] text-destructive">
                {mutation.error instanceof Error
                  ? mutation.error.message
                  : "Could not save this entry."}
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <button
              type="button"
              className={iconButtonClass}
              onClick={() => {
                mutation.reset();
                setOpen(false);
              }}
              disabled={mutation.isPending}
            >
              Cancel
            </button>
            <button
              type="button"
              className="inline-flex items-center rounded-sm bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground disabled:opacity-50"
              disabled={mutation.isPending || content.trim() === ""}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending ? "Saving…" : "Save note"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * The design write-up kept on the solution: what the design is and how it is
 * configured. Same Save/Cancel behaviour as every other editor here.
 */
export function DesignEditor({
  solutionId,
  designSummary,
  configurationDetails,
}: {
  solutionId: string;
  designSummary: string | null;
  configurationDetails: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [summary, setSummary] = useState(designSummary ?? "");
  const [config, setConfig] = useState(configurationDetails ?? "");
  const invalidate = useInvalidate(solutionId);
  const save = useServerFn(setSolutionDesign);

  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          id: solutionId,
          designSummary: summary.trim() === "" ? null : summary.trim(),
          configurationDetails: config.trim() === "" ? null : config.trim(),
        },
      }),
    onSuccess: async () => {
      await invalidate();
      setEditing(false);
    },
  });

  const reset = () => {
    setSummary(designSummary ?? "");
    setConfig(configurationDetails ?? "");
    mutation.reset();
  };

  if (!editing) {
    return (
      <button
        type="button"
        className={iconButtonClass}
        onClick={() => {
          reset();
          setEditing(true);
        }}
      >
        <Pencil className="h-3 w-3" /> Edit design record
      </button>
    );
  }

  const textareaClass =
    "min-h-24 w-full rounded-sm border border-border bg-background px-2 py-1.5 text-[12px] leading-relaxed outline-none focus:ring-1 focus:ring-ring";

  return (
    <div className="space-y-2">
      <div className="grid gap-3 md:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
            Design summary
          </span>
          <textarea
            className={textareaClass}
            aria-label="Design summary"
            placeholder="What the solution does and how it is put together"
            value={summary}
            disabled={mutation.isPending}
            onChange={(e) => setSummary(e.target.value)}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
            Configuration details
          </span>
          <textarea
            className={textareaClass}
            aria-label="Configuration details"
            placeholder="Settings, forms, workflows and anything needed to rebuild this"
            value={config}
            disabled={mutation.isPending}
            onChange={(e) => setConfig(e.target.value)}
          />
        </label>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={iconButtonClass}
          disabled={mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          className={iconButtonClass}
          disabled={mutation.isPending}
          onClick={() => {
            reset();
            setEditing(false);
          }}
        >
          Cancel
        </button>
        {mutation.isError ? (
          <span className="text-[11px] text-destructive">
            {mutation.error instanceof Error ? mutation.error.message : "Save failed"}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Start a solution on an account.
 *
 * WHAT WAS MISSING. Every part of a solution already existed — the design
 * summary, the working notes, the field mappings, the per-solution record page
 * — and nothing could create one. Production held zero solutions, zero notes
 * and zero field mappings, which is why the tab read as pointless: a fully
 * furnished room with no door.
 *
 * An account can have several. An integration, a data migration and a form set
 * are three different things to build, with different owners and different
 * notes, and forcing them into one record loses whose is whose.
 */
export function NewSolution({
  implementationId,
  customerId,
  team,
}: {
  implementationId: string;
  customerId: string;
  team: TeamMemberOption[];
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [config, setConfig] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [ownerGroup, setOwnerGroup] = useState<string>(TECHNICAL_SOLUTIONS_ROLE);
  const [status, setStatus] = useState<string>("draft");

  const queryClient = useQueryClient();
  const create = useServerFn(addSolution);

  const mutation = useMutation({
    mutationFn: () =>
      create({
        data: {
          implementationId,
          title: title.trim(),
          designSummary: summary.trim() || null,
          configurationDetails: config.trim() || null,
          ownerId: ownerId || null,
          status: status as (typeof SOLUTION_STATUSES)[number],
        },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["customer", customerId] });
      void queryClient.invalidateQueries({ queryKey: ["technical-solutions"] });
      setOpen(false);
      setTitle("");
      setSummary("");
      setConfig("");
      setOwnerId("");
      setOwnerGroup(TECHNICAL_SOLUTIONS_ROLE);
      setStatus("draft");
    },
  });

  return (
    <>
      <button type="button" className={iconButtonClass} onClick={() => setOpen(true)}>
        <Plus className="h-3 w-3" /> New solution
      </button>

      <Dialog open={open} onOpenChange={(v) => (mutation.isPending ? null : setOpen(v))}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-[14px]">New solution</DialogTitle>
            <DialogDescription className="text-[11px]">
              One thing this account&apos;s engineers are building — an integration, a migration, a
              form set. Its notes, field mappings and progress live on its own record.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2.5">
            <label className="block space-y-0.5">
              <span className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                What is being built
              </span>
              <input
                className="h-7 w-full rounded-sm border border-border bg-background px-1.5 text-[12px] outline-none focus:ring-1 focus:ring-ring"
                value={title}
                autoFocus
                placeholder="Dispatch → ERP work order sync"
                disabled={mutation.isPending}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>

            <label className="block space-y-0.5">
              <span className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                What it does
              </span>
              <textarea
                className="w-full rounded-sm border border-border bg-background px-1.5 py-1 text-[12px] outline-none focus:ring-1 focus:ring-ring"
                rows={3}
                value={summary}
                placeholder="In the engineer's words: what moves, in which direction, and when."
                disabled={mutation.isPending}
                onChange={(e) => setSummary(e.target.value)}
              />
            </label>

            <label className="block space-y-0.5">
              <span className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                How it is set up
              </span>
              <textarea
                className="w-full rounded-sm border border-border bg-background px-1.5 py-1 text-[12px] outline-none focus:ring-1 focus:ring-ring"
                rows={3}
                value={config}
                placeholder="Endpoints, where the credentials live, sync cadence. Field mappings go on the record itself."
                disabled={mutation.isPending}
                onChange={(e) => setConfig(e.target.value)}
              />
            </label>

            <div className="flex flex-wrap items-end gap-3">
              <label className="space-y-0.5">
                <span className="block text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                  Status
                </span>
                <select
                  className={selectClass}
                  value={status}
                  disabled={mutation.isPending}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  {SOLUTION_STATUSES.map((v) => (
                    <option key={v} value={v}>
                      {humanize(v)}
                    </option>
                  ))}
                </select>
              </label>
              <OwnerPicker
                team={team}
                group={ownerGroup}
                ownerId={ownerId}
                personLabel="Who is building it"
                disabled={mutation.isPending}
                onChange={(next) => {
                  setOwnerGroup(next.group);
                  setOwnerId(next.ownerId);
                }}
              />
            </div>
          </div>

          {mutation.error ? (
            <p role="alert" className="text-[12px] text-destructive">
              {(mutation.error as Error).message}
            </p>
          ) : null}

          <DialogFooter>
            <button
              type="button"
              className={iconButtonClass}
              disabled={mutation.isPending || title.trim() === ""}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending ? "Creating…" : "Create solution"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
