import { useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Trash2, Upload } from "lucide-react";

import { BrandMarkTile } from "@/components/brand-mark";
import { PageBody, PageHeader } from "@/components/page";
import { Panel } from "@/components/record";
import { allToolMarks } from "@/lib/brand-marks";
import { TOOLS } from "@/lib/onboarding-tools";
import { deleteToolMarkFn, listToolMarksFn, uploadToolMarkFn } from "@/lib/tool-marks.functions";

/**
 * The logo library. One row per system the app knows, the built-in mark on
 * the left, the uploaded logo (if any) beside it. Upload once and the logo
 * replaces the mark everywhere: deal, customer, pipeline card, welcome page.
 */
export const Route = createFileRoute("/admin/integration-marks")({
  head: () => ({ meta: [{ title: "Integration logos — Admin" }] }),
  component: IntegrationMarksPage,
});

function IntegrationMarksPage() {
  const qc = useQueryClient();
  const list = useServerFn(listToolMarksFn);
  const upload = useServerFn(uploadToolMarkFn);
  const remove = useServerFn(deleteToolMarkFn);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const files = useQuery({ queryKey: ["tool-mark-files"], queryFn: () => list() });
  const uploaded = new Map((files.data ?? []).map((f) => [f.tool, f]));
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["tool-marks"] });
  };

  const up = useMutation({
    mutationFn: async ({ tool, file }: { tool: string; file: File }) => {
      const dataBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("Could not read that file."));
        reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
        reader.readAsDataURL(file);
      });
      return upload({ data: { tool, contentType: file.type as never, dataBase64 } });
    },
    onMutate: () => setError(null),
    onSuccess: (rows) => {
      qc.setQueryData(["tool-mark-files"], rows);
      invalidate();
    },
    onError: (e) => setError((e as Error).message),
  });
  const del = useMutation({
    mutationFn: (tool: string) => remove({ data: { tool } }),
    onSuccess: (rows) => {
      qc.setQueryData(["tool-mark-files"], rows);
      invalidate();
    },
    onError: (e) => setError((e as Error).message),
  });

  const builtIn = new Map(allToolMarks().map((m) => [m.key, m.mark]));

  return (
    <>
      <PageHeader
        title="Integration logos"
        description="One per system. PNG or SVG on a transparent background, square-ish, under 1MB. The built-in mark stands in until a logo is uploaded, and comes back if it is removed."
      />
      <PageBody className="space-y-4">
        {error ? (
          <p role="alert" className="text-[12px] text-destructive">
            {error}
          </p>
        ) : null}
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/svg+xml,image/webp,image/jpeg"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f && pending) up.mutate({ tool: pending, file: f });
            e.target.value = "";
          }}
        />
        <Panel title="Systems" count={TOOLS.length} meta={`${uploaded.size} with an uploaded logo`}>
          <ul className="divide-y divide-border">
            {TOOLS.map((t) => {
              const mark = builtIn.get(t.key);
              const file = uploaded.get(t.key);
              return (
                <li key={t.key} className="flex flex-wrap items-center gap-4 px-3 py-2.5">
                  <span className="flex items-center gap-2">
                    {mark ? <BrandMarkTile mark={mark} size="md" /> : null}
                    <span className="text-[10px] text-muted-foreground">built-in</span>
                  </span>
                  <span className="flex items-center gap-2">
                    {mark ? (
                      <BrandMarkTile mark={mark} size="md" override={file?.url ?? null} />
                    ) : null}
                    <span className="text-[10px] text-muted-foreground">
                      {file ? "uploaded" : "no upload"}
                    </span>
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium">{t.name}</p>
                    <p className="font-mono text-[10px] text-muted-foreground">
                      {t.key} · {t.kind}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={up.isPending}
                      onClick={() => {
                        setPending(t.key);
                        inputRef.current?.click();
                      }}
                      className="inline-flex h-7 items-center gap-1 rounded-sm border border-border bg-card px-2.5 text-[12px] font-medium hover:bg-muted disabled:opacity-50"
                    >
                      <Upload className="h-3.5 w-3.5" />{" "}
                      {up.isPending && pending === t.key
                        ? "Uploading…"
                        : file
                          ? "Replace"
                          : "Upload logo"}
                    </button>
                    {file ? (
                      <button
                        type="button"
                        title="Remove the uploaded logo"
                        disabled={del.isPending}
                        onClick={() => del.mutate(t.key)}
                        className="inline-flex h-7 items-center rounded-sm border border-border px-2 text-muted-foreground hover:text-destructive disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>
      </PageBody>
    </>
  );
}
