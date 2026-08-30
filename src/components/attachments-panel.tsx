import { useRef, useState } from "react";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, FileText, Link2, Paperclip, Trash2, Upload } from "lucide-react";

import { NoRows, Panel } from "@/components/record";
import { Button } from "@/components/ui/button";
import {
  addAttachmentLink,
  deleteAttachment,
  getAccountFiles,
  openAttachment,
  uploadAttachment,
} from "@/lib/attachments.functions";
import { fmtDate } from "@/lib/hub-format";
import { cn } from "@/lib/utils";

const KINDS = [
  { value: "sow", label: "SOW" },
  { value: "board", label: "Board" },
  { value: "deck", label: "Deck" },
  { value: "doc", label: "Doc" },
  { value: "sheet", label: "Sheet" },
  { value: "recording", label: "Recording" },
  { value: "other", label: "Other" },
] as const;

const KIND_LABEL = new Map<string, string>(KINDS.map((k) => [k.value as string, k.label]));

export const attachmentsQuery = (implementationId: string) =>
  queryOptions({
    queryKey: ["account-files", implementationId],
    queryFn: () => getAccountFiles({ data: { implementationId } }),
  });

function fmtSize(bytes: number | null): string | null {
  if (bytes == null) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Everything attached to this account, in one place.
 *
 * Files and links sit in the same list on purpose. A Miro board has no file to
 * upload and a signed PowerPoint has no useful URL, but both are "the thing I
 * made for this account" — splitting them would mean two lists, two add
 * buttons, and somebody deciding which one their artefact is.
 */
export function AttachmentsPanel({ implementationId }: { implementationId: string }) {
  const { data: files } = useSuspenseQuery(attachmentsQuery(implementationId));
  const [adding, setAdding] = useState<null | "link" | "file">(null);
  const queryClient = useQueryClient();
  const open = useServerFn(openAttachment);

  const refresh = () =>
    void queryClient.invalidateQueries({ queryKey: ["account-files", implementationId] });

  // Opened through the server so the private bucket stays private: it mints a
  // one-hour signed URL per click rather than the page holding a durable link.
  const openFile = useMutation({
    mutationFn: (id: string) => open({ data: { id } }),
    onSuccess: (r) => {
      if (r?.url) window.open(r.url, "_blank", "noopener,noreferrer");
    },
  });

  return (
    <Panel
      title="Attachments"
      count={files.length}
      level="supporting"
      action={
        <div className="flex gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAdding(adding === "link" ? null : "link")}
          >
            <Link2 /> Link
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAdding(adding === "file" ? null : "file")}
          >
            <Upload /> Upload
          </Button>
        </div>
      }
    >
      {adding === "link" ? (
        <AddLink
          implementationId={implementationId}
          onDone={() => {
            setAdding(null);
            refresh();
          }}
        />
      ) : null}
      {adding === "file" ? (
        <AddFile
          implementationId={implementationId}
          onDone={() => {
            setAdding(null);
            refresh();
          }}
        />
      ) : null}

      {files.length === 0 ? (
        <NoRows label="No SOWs, boards or decks attached yet." />
      ) : (
        <ul className="divide-y divide-border">
          {files.map((f) => (
            <li key={f.id} className="flex items-center gap-3 px-3 py-2">
              <span className="shrink-0 text-muted-foreground">
                {f.external_url ? (
                  <ExternalLink className="h-3.5 w-3.5" />
                ) : (
                  <FileText className="h-3.5 w-3.5" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() =>
                    f.origin === "field" && f.external_url
                      ? window.open(f.external_url, "_blank", "noopener,noreferrer")
                      : openFile.mutate(f.id)
                  }
                  className="truncate text-left text-[13px] font-medium hover:underline"
                >
                  {f.title}
                </button>
                <p className="truncate text-[11px] text-muted-foreground">
                  {[
                    KIND_LABEL.get(f.kind) ?? f.kind,
                    fmtSize(f.size_bytes),
                    f.added_by_name,
                    f.created_at ? fmtDate(f.created_at) : null,
                    f.description,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              {/* A legacy row IS the SOW field on the implementation record.
                  Offering a delete here would blank a field the handoff
                  completeness check reads, from a screen that never said so. */}
              {f.origin === "file" ? (
                <RemoveButton id={f.id} onDone={refresh} />
              ) : (
                <span className="shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground">
                  On record
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function RemoveButton({ id, onDone }: { id: string; onDone: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const del = useServerFn(deleteAttachment);
  const m = useMutation({ mutationFn: () => del({ data: { id } }), onSuccess: onDone });

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        aria-label="Remove attachment"
        className="lift shrink-0 rounded-sm p-1 text-muted-foreground hover:text-destructive"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    );
  }
  return (
    <span className="flex shrink-0 items-center gap-1">
      <Button variant="destructive" size="sm" disabled={m.isPending} onClick={() => m.mutate()}>
        Remove
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
        Cancel
      </Button>
    </span>
  );
}

const fieldClass =
  "h-7 w-full rounded-sm border border-input bg-background px-2 text-[12px] outline-none focus-visible:ring-2 focus-visible:ring-ring";

function AddLink({ implementationId, onDone }: { implementationId: string; onDone: () => void }) {
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [kind, setKind] = useState<string>("board");
  const add = useServerFn(addAttachmentLink);
  const m = useMutation({
    mutationFn: () => add({ data: { implementationId, title, url, kind: kind as "board" } }),
    onSuccess: onDone,
  });

  return (
    <div className="space-y-2 border-b border-border bg-muted/40 px-3 py-2.5">
      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <input
          className={fieldClass}
          placeholder="What is it? e.g. Discovery board"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <select className={fieldClass} value={kind} onChange={(e) => setKind(e.target.value)}>
          {KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
      </div>
      <input
        className={fieldClass}
        placeholder="https://miro.com/app/board/…"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
      />
      {m.error ? (
        <p className="text-[11px] text-destructive">{(m.error as Error).message}</p>
      ) : null}
      <Button
        size="sm"
        disabled={m.isPending || !title.trim() || !url.trim()}
        onClick={() => m.mutate()}
      >
        <Link2 /> Attach link
      </Button>
    </div>
  );
}

function AddFile({ implementationId, onDone }: { implementationId: string; onDone: () => void }) {
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<string>("sow");
  const [file, setFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const upload = useServerFn(uploadAttachment);

  const m = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Choose a file first");
      const buf = await file.arrayBuffer();
      // Chunked rather than String.fromCharCode(...bytes): spreading a
      // multi-megabyte array into an argument list overflows the call stack,
      // and it does it at exactly the file size somebody first tries in anger.
      let binary = "";
      const bytes = new Uint8Array(buf);
      for (let i = 0; i < bytes.length; i += 8192) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      }
      return upload({
        data: {
          implementationId,
          title: title.trim() || file.name,
          kind: kind as "sow",
          fileName: file.name,
          contentType: file.type || "application/octet-stream",
          dataBase64: btoa(binary),
        },
      });
    },
    onSuccess: onDone,
  });

  return (
    <div className="space-y-2 border-b border-border bg-muted/40 px-3 py-2.5">
      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <input
          className={fieldClass}
          placeholder={file ? file.name : "Name it (defaults to the file name)"}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <select className={fieldClass} value={kind} onChange={(e) => setKind(e.target.value)}>
          {KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
      </div>
      <input
        ref={inputRef}
        type="file"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        className={cn(
          "block w-full text-[12px] text-muted-foreground",
          "file:mr-2 file:rounded-md file:border file:border-input file:bg-background",
          "file:px-2 file:py-1 file:text-[12px] file:text-foreground",
        )}
      />
      {m.error ? (
        <p className="text-[11px] text-destructive">{(m.error as Error).message}</p>
      ) : null}
      <Button size="sm" disabled={m.isPending || !file} onClick={() => m.mutate()}>
        <Paperclip /> {m.isPending ? "Uploading…" : "Upload"}
      </Button>
    </div>
  );
}
