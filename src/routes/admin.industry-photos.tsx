import { useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Trash2, Upload } from "lucide-react";

import { PageBody, PageHeader } from "@/components/page";
import { INDUSTRIES } from "@/lib/intake-answers";
import {
  deleteIndustryPhotoFn,
  listIndustryPhotosFn,
  uploadIndustryPhotoFn,
} from "@/lib/industry-photos.functions";

/**
 * The photo library behind the welcome page. One place, by industry: upload
 * two or three licensed jobsite photos per industry and every customer in
 * that industry gets one on their cover and their first-form card. No photo
 * for an industry is fine — the page has an icon composition for that.
 */
export const Route = createFileRoute("/admin/industry-photos")({
  head: () => ({ meta: [{ title: "Industry photos — Admin" }] }),
  component: IndustryPhotosPage,
});

function IndustryPhotosPage() {
  const qc = useQueryClient();
  const list = useServerFn(listIndustryPhotosFn);
  const upload = useServerFn(uploadIndustryPhotoFn);
  const remove = useServerFn(deleteIndustryPhotoFn);
  const [industry, setIndustry] = useState<string>(INDUSTRIES[0]);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const photos = useQuery({ queryKey: ["industry-photos"], queryFn: () => list() });

  const up = useMutation({
    mutationFn: async (file: File) => {
      const dataBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("Could not read that file."));
        reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
        reader.readAsDataURL(file);
      });
      return upload({
        data: { industry, fileName: file.name, contentType: file.type as never, dataBase64 },
      });
    },
    onMutate: () => setError(null),
    onSuccess: (rows) => qc.setQueryData(["industry-photos"], rows),
    onError: (e) => setError((e as Error).message),
  });
  const del = useMutation({
    mutationFn: (path: string) => remove({ data: { path } }),
    onSuccess: (rows) => qc.setQueryData(["industry-photos"], rows),
    onError: (e) => setError((e as Error).message),
  });

  const byIndustry = new Map<string, NonNullable<typeof photos.data>>();
  for (const p of photos.data ?? []) {
    byIndustry.set(p.industry, [...(byIndustry.get(p.industry) ?? []), p]);
  }

  return (
    <>
      <PageHeader
        title="Industry photos"
        description="Real crews on real jobs. Two or three per industry, landscape, JPEG under 2MB. Licensed — these go on pages customers keep."
        actions={
          <div className="flex items-center gap-2">
            <select
              className="h-7 rounded-sm border border-border bg-background px-2 text-[12px]"
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
            >
              {INDUSTRIES.map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </select>
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) up.mutate(f);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              disabled={up.isPending}
              onClick={() => inputRef.current?.click()}
              className="inline-flex h-7 items-center gap-1 rounded-sm bg-primary px-2.5 text-[12px] font-medium text-primary-foreground disabled:opacity-50"
            >
              <Upload className="h-3.5 w-3.5" />{" "}
              {up.isPending ? "Uploading…" : `Add to ${industry}`}
            </button>
          </div>
        }
      />
      <PageBody className="space-y-6">
        {error ? (
          <p role="alert" className="text-[12px] text-destructive">
            {error}
          </p>
        ) : null}
        {photos.isPending ? <p className="text-[12px] text-muted-foreground">Loading…</p> : null}
        {INDUSTRIES.map((i) => {
          const rows = byIndustry.get(i) ?? [];
          return (
            <section key={i}>
              <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                {i}{" "}
                <span className="font-normal normal-case tracking-normal">
                  · {rows.length || "none yet"}
                </span>
              </h2>
              {rows.length ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                  {rows.map((p) => (
                    <figure
                      key={p.path}
                      className="group relative aspect-[16/10] overflow-hidden rounded-md border border-border bg-muted"
                    >
                      {p.url ? (
                        <img src={p.url} alt="" className="h-full w-full object-cover" />
                      ) : null}
                      <button
                        type="button"
                        title="Remove"
                        disabled={del.isPending}
                        onClick={() => del.mutate(p.path)}
                        className="absolute right-1.5 top-1.5 hidden rounded-sm bg-background/90 p-1 text-muted-foreground hover:text-destructive group-hover:block"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </figure>
                  ))}
                </div>
              ) : (
                <p className="text-[12px] text-muted-foreground">
                  Customers in {i} see the icon composition until a photo is added.
                </p>
              )}
            </section>
          );
        })}
      </PageBody>
    </>
  );
}
