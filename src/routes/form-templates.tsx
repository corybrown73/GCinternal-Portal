import { useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ImagePlus } from "lucide-react";

import { EmptyState, PageBody, PageHeader } from "@/components/page";
import { Panel } from "@/components/record";
import { TemplateCard } from "@/components/template-card";
import { canEditSales, useProfile } from "@/lib/auth";
import { createFormTemplateFn, listFormTemplatesFn } from "@/lib/form-templates.functions";
import type { FormTemplateCard } from "@/lib/form-templates.server";
import { INDUSTRIES } from "@/lib/intake-answers";

/**
 * The form library.
 *
 * Pictures of forms, by industry, with the words to describe each one. This
 * is where the onboarding conversation for a customer with no forms starts:
 * "which of these is closest to what you do today?" A picture is the whole
 * point — a person who has never seen GoCanvas can point at one.
 */

const libraryQuery = queryOptions({
  queryKey: ["form-templates"],
  queryFn: () => listFormTemplatesFn({ data: {} }),
});

export const Route = createFileRoute("/form-templates")({
  head: () => ({ meta: [{ title: "Form library — GoCanvas Handoff Hub" }] }),
  loader: ({ context }) => {
    void context.queryClient.ensureQueryData(libraryQuery).catch(() => {});
  },
  errorComponent: ({ error }) => (
    <div role="alert" className="p-6 text-[13px] text-destructive">
      Could not load the form library: {error.message}
    </div>
  ),
  component: FormLibraryPage,
});

function FormLibraryPage() {
  const { data: templates } = useSuspenseQuery(libraryQuery);
  const { profile } = useProfile();
  const editable = canEditSales(profile?.role);
  const [industry, setIndustry] = useState<string>("");
  const [adding, setAdding] = useState(false);

  const industries = Array.from(new Set(templates.map((t) => t.industry))).sort();
  const shown = industry ? templates.filter((t) => t.industry === industry) : templates;
  const byIndustry = new Map<string, FormTemplateCard[]>();
  for (const t of shown) byIndustry.set(t.industry, [...(byIndustry.get(t.industry) ?? []), t]);

  return (
    <>
      <PageHeader
        title="Form library"
        description="Starting points by industry — a picture of the form and what it does. When a customer has no forms yet, this is what the conversation begins from."
        actions={
          <div className="flex items-center gap-2">
            <select
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              className="rounded-sm border border-border bg-background px-2 py-1 text-[12px]"
            >
              <option value="">Every industry</option>
              {industries.map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </select>
            {editable ? (
              <button
                type="button"
                onClick={() => setAdding((v) => !v)}
                className="inline-flex items-center gap-1 rounded-sm border border-border px-2 py-1 text-[12px] hover:bg-muted"
              >
                <ImagePlus className="h-3.5 w-3.5" /> {adding ? "Close" : "Add a template"}
              </button>
            ) : null}
          </div>
        }
      />
      <PageBody className="space-y-4">
        {adding ? <AddTemplate onDone={() => setAdding(false)} /> : null}

        {templates.length === 0 ? (
          <EmptyState
            title="Nothing in the library yet"
            description="Add a template: a name, an industry, and a picture of the form. A screenshot is enough."
          />
        ) : null}

        {Array.from(byIndustry.entries()).map(([name, cards]) => (
          <Panel key={name} title={name} count={cards.length}>
            <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {cards.map((t) => (
                <TemplateCard key={t.id} template={t} editable={editable} />
              ))}
            </div>
          </Panel>
        ))}
      </PageBody>
    </>
  );
}

function AddTemplate({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const create = useServerFn(createFormTemplateFn);
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState<string>(INDUSTRIES[0]);
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      let image: { fileName: string; contentType: string; dataBase64: string } | null = null;
      if (file) {
        const dataBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onerror = () => reject(new Error("Could not read that picture."));
          reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
          reader.readAsDataURL(file);
        });
        image = { fileName: file.name, contentType: file.type, dataBase64 };
      }
      return create({
        data: {
          name,
          industry,
          description: description.trim() || null,
          tags: tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
          image: image as never,
        },
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["form-templates"] });
      onDone();
    },
    onError: (e) => setError((e as Error).message),
  });

  const input =
    "w-full rounded-sm border border-border bg-background px-2 py-1 text-[12px] focus:outline-none focus:ring-1 focus:ring-primary";

  return (
    <Panel title="Add a template" level="primary">
      <form
        className="grid grid-cols-1 gap-3 p-3 md:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          mutation.mutate();
        }}
      >
        <label className="space-y-1 text-[11px] text-muted-foreground">
          Name
          <input
            className={input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Daily Site Inspection"
            required
          />
        </label>
        <label className="space-y-1 text-[11px] text-muted-foreground">
          Industry
          <select className={input} value={industry} onChange={(e) => setIndustry(e.target.value)}>
            {INDUSTRIES.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-[11px] text-muted-foreground md:col-span-2">
          What it does, in a sentence
          <input
            className={input}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Site walk with photos, hazards and a supervisor signature."
          />
        </label>
        <label className="space-y-1 text-[11px] text-muted-foreground">
          Tags, comma-separated
          <input
            className={input}
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="photos, signature, daily"
          />
        </label>
        <label className="space-y-1 text-[11px] text-muted-foreground">
          Picture of the form
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="block w-full text-[12px]"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
        {error ? (
          <p role="alert" className="text-[12px] text-destructive md:col-span-2">
            {error}
          </p>
        ) : null}
        <div className="flex items-center gap-2 md:col-span-2">
          <button
            type="submit"
            disabled={mutation.isPending || !name.trim()}
            className="rounded-sm bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground disabled:opacity-60"
          >
            {mutation.isPending ? "Saving…" : "Add to the library"}
          </button>
          <button
            type="button"
            onClick={onDone}
            className="rounded-sm border border-border px-3 py-1.5 text-[12px]"
          >
            Cancel
          </button>
        </div>
      </form>
    </Panel>
  );
}
