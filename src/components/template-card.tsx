import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Trash2 } from "lucide-react";

import { deleteFormTemplateFn } from "@/lib/form-templates.functions";
import type { FormTemplateCard } from "@/lib/form-templates.server";
import { cn } from "@/lib/utils";

/**
 * One card in the form library: the picture, the name, a sentence.
 *
 * Used two ways. On the library page it is browsable and, for editors,
 * deletable. In the onboarding intake it is selectable — the customer points
 * at the one closest to what they do — and there it has no delete, because a
 * card being chosen is not the moment to remove it from the library.
 */
export function TemplateCard({
  template,
  editable,
  selected,
  onSelect,
}: {
  template: FormTemplateCard;
  editable?: boolean | undefined;
  selected?: boolean | undefined;
  onSelect?: (() => void) | undefined;
}) {
  const qc = useQueryClient();
  const del = useServerFn(deleteFormTemplateFn);
  const remove = useMutation({
    mutationFn: () => del({ data: { id: template.id } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["form-templates"] }),
  });

  const body = (
    <>
      <div className="aspect-[4/3] w-full overflow-hidden rounded-t-md bg-muted/40">
        {template.imageUrl ? (
          <img
            src={template.imageUrl}
            alt={template.name}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-[11px] text-muted-foreground">
            No picture yet
          </div>
        )}
      </div>
      <div className="space-y-1 p-2.5">
        <p className="text-[13px] font-medium leading-tight text-foreground">{template.name}</p>
        {template.description ? (
          <p className="line-clamp-2 text-[11px] text-muted-foreground">{template.description}</p>
        ) : null}
        {template.tags.length ? (
          <p className="truncate font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            {template.tags.join(" · ")}
          </p>
        ) : null}
      </div>
    </>
  );

  return (
    <div
      className={cn(
        "group relative rounded-md border bg-background transition-colors",
        selected ? "border-primary ring-1 ring-primary" : "border-border",
        onSelect && "cursor-pointer hover:border-primary/60",
      )}
    >
      {onSelect ? (
        <button
          type="button"
          onClick={onSelect}
          aria-pressed={selected}
          className="block w-full text-left"
        >
          {body}
        </button>
      ) : (
        body
      )}
      {editable && !onSelect ? (
        <button
          type="button"
          title="Delete template"
          disabled={remove.isPending}
          onClick={() => {
            if (window.confirm(`Delete "${template.name}" from the library?`)) remove.mutate();
          }}
          className="absolute right-1.5 top-1.5 rounded-sm border border-border bg-background/90 p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}
